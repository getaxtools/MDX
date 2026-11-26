use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

use super::ProtectedError;
use super::key_slots::{DataKey, FORMAT_VERSION, NONCE_BYTES, TAG_BYTES, VAULT_ID_BYTES};
use super::random::random_bytes;

pub const HEADER_BYTES: usize = 64;
pub const NOTE_ID_BYTES: usize = 16;
/// The manifest's header names no note.
pub const MANIFEST_NOTE_ID: [u8; NOTE_ID_BYTES] = [0; NOTE_ID_BYTES];
pub const PLAIN_CHUNK_BYTES: usize = 64 * 1_024;
const SEALED_CHUNK_BYTES: usize = NONCE_BYTES + PLAIN_CHUNK_BYTES + TAG_BYTES;
const MAGIC: &[u8; 4] = b"MDXP";
const CIPHER_XCHACHA20_POLY1305: u8 = 1;
/// The plain text is padded to whole KiB, so a file's size says less about its note.
const PADDING_BLOCK_BYTES: usize = 1_024;
const METADATA_LENGTH_BYTES: usize = 4;
/// Limits a crafted file cannot get past, checked before anything is decrypted.
pub const MAX_METADATA_BYTES: usize = 64 * 1_024;
pub const MAX_CONTENT_BYTES: usize = 2 * 1_024 * 1_024 * 1_024;
const MAX_PLAIN_BYTES: usize =
    METADATA_LENGTH_BYTES + MAX_METADATA_BYTES + MAX_CONTENT_BYTES + PADDING_BLOCK_BYTES;
pub const MAX_CHUNKS: usize = MAX_PLAIN_BYTES.div_ceil(PLAIN_CHUNK_BYTES);

/// The authenticated plain header of every protected file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileHeader {
    pub vault_id: [u8; VAULT_ID_BYTES],
    pub data_key_id: u32,
    pub note_id: [u8; NOTE_ID_BYTES],
    /// Goes up on every save, so an older copy can be told from the newest.
    pub revision: u64,
}

impl FileHeader {
    /// Magic, format version, cipher, flags, vault id, data key id, note id, revision, plain chunk
    /// size and reserved bytes, big-endian.
    pub fn to_bytes(&self) -> [u8; HEADER_BYTES] {
        let chunk_size = u32::try_from(PLAIN_CHUNK_BYTES).unwrap_or(u32::MAX);
        let mut bytes = MAGIC
            .iter()
            .copied()
            .chain([FORMAT_VERSION, CIPHER_XCHACHA20_POLY1305, 0, 0])
            .chain(self.vault_id)
            .chain(self.data_key_id.to_be_bytes())
            .chain(self.note_id)
            .chain(self.revision.to_be_bytes())
            .chain(chunk_size.to_be_bytes())
            .chain([0; 8]);
        std::array::from_fn(|_| bytes.next().unwrap_or_default())
    }

    /// Reads a header; one of a later format version is refused as such, any other oddity as damage.
    pub fn parse(bytes: &[u8]) -> Result<Self, ProtectedError> {
        let header: &[u8; HEADER_BYTES] = bytes
            .get(..HEADER_BYTES)
            .and_then(|header| header.try_into().ok())
            .ok_or(ProtectedError::Tampered)?;
        let (magic, rest) = header.split_at(MAGIC.len());
        if magic != MAGIC {
            return Err(ProtectedError::Tampered);
        }
        let mut fields = Fields(rest);
        let [version, cipher, flag_high, flag_low] = fields.take::<4>()?;
        if version > FORMAT_VERSION {
            return Err(ProtectedError::UnsupportedVersion);
        }
        let is_known_layout = version == FORMAT_VERSION
            && cipher == CIPHER_XCHACHA20_POLY1305
            && flag_high == 0
            && flag_low == 0;
        let vault_id = fields.take()?;
        let data_key_id = u32::from_be_bytes(fields.take()?);
        let note_id = fields.take()?;
        let revision = u64::from_be_bytes(fields.take()?);
        let chunk_size = u32::from_be_bytes(fields.take()?);
        let reserved: [u8; 8] = fields.take()?;
        let is_plain_layout = usize::try_from(chunk_size)
            .is_ok_and(|size| size == PLAIN_CHUNK_BYTES)
            && reserved == [0; 8];
        if !is_known_layout || !is_plain_layout {
            return Err(ProtectedError::Tampered);
        }
        Ok(Self {
            vault_id,
            data_key_id,
            note_id,
            revision,
        })
    }
}

/// Reads fixed-size fields one after another.
struct Fields<'bytes>(&'bytes [u8]);

impl Fields<'_> {
    fn take<const LENGTH: usize>(&mut self) -> Result<[u8; LENGTH], ProtectedError> {
        let (field, rest) = self
            .0
            .split_at_checked(LENGTH)
            .ok_or(ProtectedError::Tampered)?;
        self.0 = rest;
        field.try_into().map_err(|_| ProtectedError::Tampered)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
    Note,
    Attachment,
    Draft,
    Manifest,
}

/// What a protected file says about its content, encrypted with it; wiped when dropped, and shown by
/// `Debug` without its title, folder or file name.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    #[zeroize(skip)]
    pub kind: FileKind,
    pub title: String,
    /// The folder inside the protected section, with `/` between parts; empty at its top.
    pub folder: String,
    pub created_ms: u64,
    pub modified_ms: u64,
    pub content_length: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
}

impl std::fmt::Debug for FileMetadata {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("FileMetadata")
            .field("kind", &self.kind)
            .field("created_ms", &self.created_ms)
            .field("modified_ms", &self.modified_ms)
            .field("content_length", &self.content_length)
            .finish_non_exhaustive()
    }
}

/// What a file must be to be opened in a place: the note its name says, and a kind that fits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExpectedFile {
    note_id: [u8; NOTE_ID_BYTES],
    /// `None` takes any kind but the manifest.
    kind: Option<FileKind>,
}

impl ExpectedFile {
    pub const MANIFEST: Self = Self {
        note_id: MANIFEST_NOTE_ID,
        kind: Some(FileKind::Manifest),
    };

    /// A note, attachment or draft file named by this note id.
    pub const fn note(note_id: [u8; NOTE_ID_BYTES]) -> Self {
        Self {
            note_id,
            kind: None,
        }
    }

    pub const fn note_of_kind(note_id: [u8; NOTE_ID_BYTES], kind: FileKind) -> Self {
        Self {
            note_id,
            kind: Some(kind),
        }
    }

    fn accepts(&self, header: &FileHeader, metadata: &FileMetadata) -> bool {
        let is_manifest = metadata.kind == FileKind::Manifest;
        let is_kind_expected = match self.kind {
            Some(kind) => metadata.kind == kind,
            None => !is_manifest,
        };
        header.note_id == self.note_id
            && is_kind_expected
            && is_manifest == (header.note_id == MANIFEST_NOTE_ID)
    }
}

/// A protected file opened: its header, its metadata and its exact content bytes.
pub struct OpenedFile {
    pub header: FileHeader,
    pub metadata: FileMetadata,
    pub content: Zeroizing<Vec<u8>>,
}

/// Encrypts a file: metadata, then the exact content bytes, padded to whole KiB, in 64 KiB chunks,
/// each with its own random nonce and with the header, its index and a last-chunk flag as associated
/// data. The content length in `metadata` is set from `content`.
pub fn seal_file(
    header: &FileHeader,
    metadata: &FileMetadata,
    content: &[u8],
    data_key: &DataKey,
) -> Result<Vec<u8>, ProtectedError> {
    if header.data_key_id != data_key.id {
        return Err(ProtectedError::WrongKey);
    }
    let plain = plain_stream(metadata, content)?;
    seal_with_nonces(header, &plain, data_key, &mut random_bytes::<NONCE_BYTES>)
}

fn seal_with_nonces(
    header: &FileHeader,
    plain: &[u8],
    data_key: &DataKey,
    next_nonce: &mut dyn FnMut() -> Result<[u8; NONCE_BYTES], ProtectedError>,
) -> Result<Vec<u8>, ProtectedError> {
    let header_bytes = header.to_bytes();
    let cipher = XChaCha20Poly1305::new_from_slice(data_key.bytes())
        .map_err(|_| ProtectedError::WrongKey)?;
    let chunk_count = plain.len().div_ceil(PLAIN_CHUNK_BYTES);
    let mut sealed = Vec::with_capacity(HEADER_BYTES + chunk_count * SEALED_CHUNK_BYTES);
    sealed.extend_from_slice(&header_bytes);
    for (index, chunk) in plain.chunks(PLAIN_CHUNK_BYTES).enumerate() {
        let nonce = next_nonce()?;
        let associated = chunk_associated_data(&header_bytes, index, index + 1 == chunk_count);
        let encrypted = cipher
            .encrypt(
                &XNonce::from(nonce),
                Payload {
                    msg: chunk,
                    aad: &associated,
                },
            )
            .map_err(|_| ProtectedError::TooLarge)?;
        sealed.extend_from_slice(&nonce);
        sealed.extend_from_slice(&encrypted);
    }
    Ok(sealed)
}

/// `u32 metadata length ‖ metadata JSON ‖ content ‖ zeros up to the next KiB`, in a buffer made once
/// at its final size and wiped when dropped.
fn plain_stream(
    metadata: &FileMetadata,
    content: &[u8],
) -> Result<Zeroizing<Vec<u8>>, ProtectedError> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err(ProtectedError::TooLarge);
    }
    let mut metadata = metadata.clone();
    metadata.content_length = u64::try_from(content.len()).map_err(|_| ProtectedError::TooLarge)?;
    let metadata_json = json_sized_once(&metadata)?;
    if metadata_json.len() > MAX_METADATA_BYTES {
        return Err(ProtectedError::TooLarge);
    }
    let unpadded = METADATA_LENGTH_BYTES + metadata_json.len() + content.len();
    let padded = unpadded.div_ceil(PADDING_BLOCK_BYTES) * PADDING_BLOCK_BYTES;
    let mut plain = Zeroizing::new(Vec::with_capacity(padded));
    let metadata_length =
        u32::try_from(metadata_json.len()).map_err(|_| ProtectedError::TooLarge)?;
    plain.extend_from_slice(&metadata_length.to_be_bytes());
    plain.extend_from_slice(&metadata_json);
    plain.extend_from_slice(content);
    plain.resize(padded, 0);
    Ok(plain)
}

/// JSON in a buffer made once at its final size, so no copy is left behind by a reallocation, and
/// wiped when dropped.
pub fn json_sized_once(value: &impl Serialize) -> Result<Zeroizing<Vec<u8>>, ProtectedError> {
    let mut counter = ByteCounter(0);
    serde_json::to_writer(&mut counter, value).map_err(|_| ProtectedError::TooLarge)?;
    let mut bytes = Zeroizing::new(Vec::with_capacity(counter.0));
    serde_json::to_writer(&mut *bytes, value).map_err(|_| ProtectedError::TooLarge)?;
    Ok(bytes)
}

struct ByteCounter(usize);

impl std::io::Write for ByteCounter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0 += bytes.len();
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn chunk_associated_data(header: &[u8; HEADER_BYTES], index: usize, is_last: bool) -> Vec<u8> {
    let index = u64::try_from(index).unwrap_or(u64::MAX);
    header
        .iter()
        .copied()
        .chain(index.to_be_bytes())
        .chain([u8::from(is_last)])
        .collect()
}

/// Opens a file of this vault with its data key. A changed, truncated, reordered or foreign file is
/// refused as tampered; a file of another data key as the wrong key.
/// Opens a file of this vault with its data key, as the file it is expected to be: a copy of another
/// note's file put in its place is refused as tampered.
pub fn open_file(
    bytes: &[u8],
    data_key: &DataKey,
    vault_id: &[u8; VAULT_ID_BYTES],
    expected: &ExpectedFile,
) -> Result<OpenedFile, ProtectedError> {
    let opened = open_unchecked(bytes, data_key, vault_id)?;
    if !expected.accepts(&opened.header, &opened.metadata) {
        return Err(ProtectedError::Tampered);
    }
    Ok(opened)
}

fn open_unchecked(
    bytes: &[u8],
    data_key: &DataKey,
    vault_id: &[u8; VAULT_ID_BYTES],
) -> Result<OpenedFile, ProtectedError> {
    let header = FileHeader::parse(bytes)?;
    if &header.vault_id != vault_id {
        return Err(ProtectedError::Tampered);
    }
    if header.data_key_id != data_key.id {
        return Err(ProtectedError::WrongKey);
    }
    let body = bytes.get(HEADER_BYTES..).unwrap_or_default();
    checked_chunk_count(body.len())?;
    let plain = decrypt_chunks(body, &header.to_bytes(), data_key)?;
    let (metadata, content) = parse_plain_stream(&plain)?;
    Ok(OpenedFile {
        header,
        metadata,
        content,
    })
}

/// How many chunks a body of this length holds; an empty body or one longer than the largest file is
/// refused before anything is decrypted or allocated.
fn checked_chunk_count(body_length: usize) -> Result<usize, ProtectedError> {
    let chunk_count = body_length.div_ceil(SEALED_CHUNK_BYTES);
    if chunk_count == 0 {
        return Err(ProtectedError::Tampered);
    }
    if chunk_count > MAX_CHUNKS {
        return Err(ProtectedError::TooLarge);
    }
    Ok(chunk_count)
}

/// Every chunk opened in order; all but the last must be full.
fn decrypt_chunks(
    body: &[u8],
    header_bytes: &[u8; HEADER_BYTES],
    data_key: &DataKey,
) -> Result<Zeroizing<Vec<u8>>, ProtectedError> {
    let chunk_count = body.len().div_ceil(SEALED_CHUNK_BYTES);
    let cipher = XChaCha20Poly1305::new_from_slice(data_key.bytes())
        .map_err(|_| ProtectedError::WrongKey)?;
    let mut plain = Zeroizing::new(Vec::with_capacity(chunk_count * PLAIN_CHUNK_BYTES));
    for (index, sealed_chunk) in body.chunks(SEALED_CHUNK_BYTES).enumerate() {
        let (nonce, encrypted) = sealed_chunk
            .split_at_checked(NONCE_BYTES)
            .ok_or(ProtectedError::Tampered)?;
        let nonce: [u8; NONCE_BYTES] = nonce.try_into().map_err(|_| ProtectedError::Tampered)?;
        let associated = chunk_associated_data(header_bytes, index, index + 1 == chunk_count);
        let chunk = Zeroizing::new(
            cipher
                .decrypt(
                    &XNonce::from(nonce),
                    Payload {
                        msg: encrypted,
                        aad: &associated,
                    },
                )
                .map_err(|_| ProtectedError::Tampered)?,
        );
        let is_short_before_the_end = index + 1 < chunk_count && chunk.len() != PLAIN_CHUNK_BYTES;
        if chunk.is_empty() || is_short_before_the_end {
            return Err(ProtectedError::Tampered);
        }
        plain.extend_from_slice(&chunk);
    }
    Ok(plain)
}

fn parse_plain_stream(plain: &[u8]) -> Result<(FileMetadata, Zeroizing<Vec<u8>>), ProtectedError> {
    if !plain.len().is_multiple_of(PADDING_BLOCK_BYTES) {
        return Err(ProtectedError::Tampered);
    }
    let (length, rest) = plain
        .split_at_checked(METADATA_LENGTH_BYTES)
        .ok_or(ProtectedError::Tampered)?;
    let length = usize::try_from(u32::from_be_bytes(
        length.try_into().map_err(|_| ProtectedError::Tampered)?,
    ))
    .map_err(|_| ProtectedError::Tampered)?;
    if length > MAX_METADATA_BYTES {
        return Err(ProtectedError::TooLarge);
    }
    let (metadata_json, rest) = rest
        .split_at_checked(length)
        .ok_or(ProtectedError::Tampered)?;
    let metadata: FileMetadata =
        serde_json::from_slice(metadata_json).map_err(|_| ProtectedError::Tampered)?;
    let content_length =
        usize::try_from(metadata.content_length).map_err(|_| ProtectedError::TooLarge)?;
    let (content, padding) = rest
        .split_at_checked(content_length)
        .ok_or(ProtectedError::Tampered)?;
    if padding.len() >= PADDING_BLOCK_BYTES || padding.iter().any(|byte| *byte != 0) {
        return Err(ProtectedError::Tampered);
    }
    Ok((metadata, Zeroizing::new(content.to_vec())))
}

#[cfg(test)]
pub(crate) mod tests {
    use std::path::PathBuf;

    use super::*;

    pub const VAULT: [u8; VAULT_ID_BYTES] = [0x11; VAULT_ID_BYTES];
    pub const NOTE: [u8; NOTE_ID_BYTES] = [0x22; NOTE_ID_BYTES];
    pub const EXPECTED: ExpectedFile = ExpectedFile::note(NOTE);

    pub fn header(revision: u64, data_key: &DataKey) -> FileHeader {
        FileHeader {
            vault_id: VAULT,
            data_key_id: data_key.id,
            note_id: NOTE,
            revision,
        }
    }

    pub fn metadata(title: &str) -> FileMetadata {
        FileMetadata {
            kind: FileKind::Note,
            title: title.to_owned(),
            folder: "Finance".to_owned(),
            created_ms: 1_700_000_000_000,
            modified_ms: 1_700_000_100_000,
            content_length: 0,
            file_name: None,
            media_type: None,
        }
    }

    fn seal(content: &[u8], data_key: &DataKey) -> Vec<u8> {
        seal_file(
            &header(1, data_key),
            &metadata("Bank details"),
            content,
            data_key,
        )
        .unwrap()
    }

    fn opens(bytes: &[u8], data_key: &DataKey) -> bool {
        open_file(bytes, data_key, &VAULT, &EXPECTED).is_ok()
    }

    /// The published sample: a fixed key, fixed nonces and a note with a byte order mark and CRLF.
    fn sample_key() -> DataKey {
        DataKey::with_bytes_for_tests(3, [0x42; 32])
    }

    fn sample_content() -> &'static [u8] {
        b"\xEF\xBB\xBF# Bank details\r\nPIN 4821\r\n"
    }

    fn sample_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/fixtures/protected-notes/sample-note-v1.mdxp")
    }

    fn sealed_sample() -> Vec<u8> {
        let key = sample_key();
        let mut counter = 0_u8;
        let mut next_nonce = || {
            counter += 1;
            Ok([counter; NONCE_BYTES])
        };
        let plain = plain_stream(&metadata("Bank details"), sample_content()).unwrap();
        seal_with_nonces(&header(5, &key), &plain, &key, &mut next_nonce).unwrap()
    }

    #[test]
    fn the_cipher_gives_the_xchacha20_poly1305_test_vector() {
        // draft-irtf-cfrg-xchacha, appendix A.3.1.
        let key: [u8; 32] = std::array::from_fn(|index| 0x80 + u8::try_from(index).unwrap());
        let nonce: [u8; NONCE_BYTES] =
            std::array::from_fn(|index| 0x40 + u8::try_from(index).unwrap());
        let plaintext = b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
        let aad = [
            0x50, 0x51, 0x52, 0x53, 0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
        ];
        let cipher = XChaCha20Poly1305::new_from_slice(&key).unwrap();

        let sealed = cipher
            .encrypt(
                &XNonce::from(nonce),
                Payload {
                    msg: plaintext,
                    aad: &aad,
                },
            )
            .unwrap();

        let expected_ciphertext = [
            0xbd, 0x6d, 0x17, 0x9d, 0x3e, 0x83, 0xd4, 0x3b, 0x95, 0x76, 0x57, 0x94, 0x93, 0xc0,
            0xe9, 0x39, 0x57, 0x2a, 0x17, 0x00, 0x25, 0x2b, 0xfa, 0xcc, 0xbe, 0xd2, 0x90, 0x2c,
            0x21, 0x39, 0x6c, 0xbb, 0x73, 0x1c, 0x7f, 0x1b, 0x0b, 0x4a, 0xa6, 0x44, 0x0b, 0xf3,
            0xa8, 0x2f, 0x4e, 0xda, 0x7e, 0x39, 0xae, 0x64, 0xc6, 0x70, 0x8c, 0x54, 0xc2, 0x16,
            0xcb, 0x96, 0xb7, 0x2e, 0x12, 0x13, 0xb4, 0x52, 0x2f, 0x8c, 0x9b, 0xa4, 0x0d, 0xb5,
            0xd9, 0x45, 0xb1, 0x1b, 0x69, 0xb9, 0x82, 0xc1, 0xbb, 0x9e, 0x3f, 0x3f, 0xac, 0x2b,
            0xc3, 0x69, 0x48, 0x8f, 0x76, 0xb2, 0x38, 0x35, 0x65, 0xd3, 0xff, 0xf9, 0x21, 0xf9,
            0x66, 0x4c, 0x97, 0x63, 0x7d, 0xa9, 0x76, 0x88, 0x12, 0xf6, 0x15, 0xc6, 0x8b, 0x13,
            0xb5, 0x2e,
        ];
        let expected_tag = [
            0xc0, 0x87, 0x59, 0x24, 0xc1, 0xc7, 0x98, 0x79, 0x47, 0xde, 0xaf, 0xd8, 0x78, 0x0a,
            0xcf, 0x49,
        ];
        assert_eq!(
            sealed,
            [&expected_ciphertext[..], &expected_tag[..]].concat()
        );
    }

    #[test]
    fn the_published_sample_file_decrypts_and_is_written_the_same_way() {
        let published = std::fs::read(sample_path()).unwrap();

        let opened = open_file(&published, &sample_key(), &VAULT, &EXPECTED).unwrap();

        assert_eq!(opened.content.as_slice(), sample_content());
        assert_eq!(opened.metadata.title, "Bank details");
        assert_eq!(opened.header.revision, 5);
        assert_eq!(published, sealed_sample());
    }

    /// Writes the published sample again after a deliberate change of the format.
    #[test]
    #[ignore = "writes the published sample; run by hand after a deliberate change of the format"]
    fn write_the_published_sample() {
        std::fs::create_dir_all(sample_path().parent().unwrap()).unwrap();
        std::fs::write(sample_path(), sealed_sample()).unwrap();
    }

    #[test]
    fn exact_bytes_round_trip_and_the_plain_text_never_shows() {
        let key = DataKey::generate(1).unwrap();
        let content = b"\xEF\xBB\xBFline one\r\nline two\nPIN 4821\r\n";

        let sealed = seal(content, &key);
        let opened = open_file(&sealed, &key, &VAULT, &EXPECTED).unwrap();

        assert_eq!(opened.content.as_slice(), content);
        assert_eq!(
            opened.metadata.content_length,
            u64::try_from(content.len()).unwrap()
        );
        for secret in [&b"4821"[..], b"Bank details", b"Finance"] {
            assert!(!sealed.windows(secret.len()).any(|window| window == secret));
        }
        assert_eq!(
            (sealed.len() - HEADER_BYTES - NONCE_BYTES - TAG_BYTES) % PADDING_BLOCK_BYTES,
            0
        );
    }

    #[test]
    fn two_saves_of_the_same_text_produce_different_files() {
        let key = DataKey::generate(1).unwrap();

        assert_ne!(seal(b"same text", &key), seal(b"same text", &key));
    }

    #[test]
    fn flipping_any_byte_of_a_file_is_refused() {
        let key = DataKey::generate(1).unwrap();
        let sealed = seal(b"short note", &key);

        for position in 0..sealed.len() {
            let mut changed = sealed.clone();
            changed[position] ^= 0x01;
            assert!(!opens(&changed, &key), "byte {position}");
        }
        assert!(opens(&sealed, &key));
    }

    #[test]
    fn dropping_swapping_or_truncating_chunks_or_flipping_a_byte_of_a_long_file_is_refused() {
        let key = DataKey::generate(1).unwrap();
        let content: Vec<u8> = (0..PLAIN_CHUNK_BYTES * 2 + 10)
            .map(|index| (index % 251) as u8)
            .collect();
        let sealed = seal(&content, &key);
        let chunk = |index: usize| {
            let start = HEADER_BYTES + index * SEALED_CHUNK_BYTES;
            sealed[start..(start + SEALED_CHUNK_BYTES).min(sealed.len())].to_vec()
        };
        let joined =
            |chunks: &[Vec<u8>]| [sealed[..HEADER_BYTES].to_vec(), chunks.concat()].concat();
        assert!(opens(&sealed, &key));

        assert!(
            !opens(&joined(&[chunk(0), chunk(2)]), &key),
            "middle chunk dropped"
        );
        assert!(
            !opens(&joined(&[chunk(0), chunk(1)]), &key),
            "last chunk dropped"
        );
        assert!(
            !opens(&joined(&[chunk(1), chunk(0), chunk(2)]), &key),
            "chunks swapped"
        );
        for length in [
            HEADER_BYTES,
            HEADER_BYTES + 1,
            HEADER_BYTES + SEALED_CHUNK_BYTES,
            sealed.len() - 1,
        ] {
            assert!(!opens(&sealed[..length], &key), "cut at {length}");
        }
        for position in (0..sealed.len())
            .step_by(997)
            .chain([HEADER_BYTES + SEALED_CHUNK_BYTES - 1])
        {
            let mut changed = sealed.clone();
            changed[position] ^= 0x80;
            assert!(!opens(&changed, &key), "byte {position}");
        }
    }

    #[test]
    fn a_file_of_another_vault_or_key_is_refused() {
        let key = DataKey::generate(1).unwrap();
        let sealed = seal(b"note", &key);

        assert!(matches!(
            open_file(&sealed, &key, &[0x99; VAULT_ID_BYTES], &EXPECTED),
            Err(ProtectedError::Tampered)
        ));
        assert!(matches!(
            open_file(&sealed, &DataKey::generate(2).unwrap(), &VAULT, &EXPECTED),
            Err(ProtectedError::WrongKey)
        ));
        assert!(matches!(
            open_file(
                &sealed,
                &DataKey::with_bytes_for_tests(1, [0; 32]),
                &VAULT,
                &EXPECTED
            ),
            Err(ProtectedError::Tampered)
        ));
    }

    #[test]
    fn a_copy_of_another_notes_file_or_the_wrong_kind_is_refused() {
        let key = DataKey::generate(1).unwrap();
        let sealed = seal(b"note", &key);

        for expected in [
            ExpectedFile::note([0x33; NOTE_ID_BYTES]),
            ExpectedFile::note_of_kind(NOTE, FileKind::Attachment),
            ExpectedFile::MANIFEST,
        ] {
            assert!(matches!(
                open_file(&sealed, &key, &VAULT, &expected),
                Err(ProtectedError::Tampered)
            ));
        }
        assert!(
            open_file(
                &sealed,
                &key,
                &VAULT,
                &ExpectedFile::note_of_kind(NOTE, FileKind::Note)
            )
            .is_ok()
        );
    }

    #[test]
    fn a_chunk_spliced_from_another_note_or_revision_is_refused() {
        let key = DataKey::generate(1).unwrap();
        let content: Vec<u8> = (0..PLAIN_CHUNK_BYTES + 10)
            .map(|index| (index % 7) as u8)
            .collect();
        let original = seal_file(&header(1, &key), &metadata("Note"), &content, &key).unwrap();
        let other_note = FileHeader {
            note_id: [0x44; NOTE_ID_BYTES],
            ..header(1, &key)
        };
        let donors = [
            seal_file(&other_note, &metadata("Note"), &content, &key).unwrap(),
            seal_file(&header(2, &key), &metadata("Note"), &content, &key).unwrap(),
        ];

        for donor in donors {
            let mut spliced = original.clone();
            let first_chunk = HEADER_BYTES..HEADER_BYTES + SEALED_CHUNK_BYTES;
            spliced[first_chunk.clone()].copy_from_slice(&donor[first_chunk]);
            assert!(matches!(
                open_file(&spliced, &key, &VAULT, &EXPECTED),
                Err(ProtectedError::Tampered)
            ));
        }
    }

    #[test]
    fn debug_output_leaves_titles_folders_and_file_names_out() {
        let mut shown = metadata("Bank details");
        shown.file_name = Some("statement.pdf".to_owned());

        let debug = format!("{shown:?}");

        for hidden in ["Bank details", "Finance", "statement.pdf"] {
            assert!(!debug.contains(hidden), "{debug}");
        }
    }

    #[test]
    fn a_later_format_version_is_named_as_such() {
        let key = DataKey::generate(1).unwrap();
        let mut sealed = seal(b"note", &key);
        sealed[4] = FORMAT_VERSION + 1;

        assert!(matches!(
            open_file(&sealed, &key, &VAULT, &EXPECTED),
            Err(ProtectedError::UnsupportedVersion)
        ));
    }

    #[test]
    fn refuses_a_chunk_count_beyond_the_largest_file_before_decrypting() {
        assert_eq!(checked_chunk_count(0), Err(ProtectedError::Tampered));
        assert_eq!(checked_chunk_count(1), Ok(1));
        assert_eq!(
            checked_chunk_count(MAX_CHUNKS * SEALED_CHUNK_BYTES),
            Ok(MAX_CHUNKS)
        );
        assert_eq!(
            checked_chunk_count(MAX_CHUNKS * SEALED_CHUNK_BYTES + 1),
            Err(ProtectedError::TooLarge)
        );
    }

    #[test]
    fn refuses_to_write_or_read_metadata_over_64_kib() {
        let key = DataKey::generate(1).unwrap();
        let oversized = metadata(&"t".repeat(MAX_METADATA_BYTES));

        assert!(matches!(
            seal_file(&header(1, &key), &oversized, b"", &key),
            Err(ProtectedError::TooLarge)
        ));

        let claimed_length = u32::try_from(MAX_METADATA_BYTES + 1).unwrap();
        let mut plain = Zeroizing::new(claimed_length.to_be_bytes().to_vec());
        plain.resize(PADDING_BLOCK_BYTES * 70, 0);
        let sealed = seal_with_nonces(
            &header(1, &key),
            &plain,
            &key,
            &mut random_bytes::<NONCE_BYTES>,
        )
        .unwrap();
        assert!(matches!(
            open_file(&sealed, &key, &VAULT, &EXPECTED),
            Err(ProtectedError::TooLarge)
        ));
    }

    #[test]
    fn refuses_authentic_files_whose_inner_lengths_do_not_add_up() {
        let key = DataKey::generate(1).unwrap();
        let mut long_claim = Zeroizing::new(2_u32.to_be_bytes().to_vec());
        long_claim.extend_from_slice(b"{}");
        long_claim.resize(PADDING_BLOCK_BYTES, 0);
        let mut unpadded = plain_stream(&metadata("Note"), b"text").unwrap();
        unpadded.truncate(PADDING_BLOCK_BYTES - 1);
        let mut dirty_padding = plain_stream(&metadata("Note"), b"text").unwrap();
        if let Some(last) = dirty_padding.last_mut() {
            *last = 1;
        }

        for plain in [long_claim, unpadded, dirty_padding] {
            let sealed = seal_with_nonces(
                &header(1, &key),
                &plain,
                &key,
                &mut random_bytes::<NONCE_BYTES>,
            )
            .unwrap();
            assert!(matches!(
                open_file(&sealed, &key, &VAULT, &EXPECTED),
                Err(ProtectedError::Tampered)
            ));
        }
    }

    #[test]
    fn the_header_round_trips() {
        let key = DataKey::generate(9).unwrap();
        let header = header(42, &key);

        assert_eq!(FileHeader::parse(&header.to_bytes()), Ok(header));
        assert_eq!(&header.to_bytes()[..6], b"MDXP\x01\x01");
    }
}
