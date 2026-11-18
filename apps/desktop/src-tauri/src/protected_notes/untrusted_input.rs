//! The entry points that read bytes another program could have written: every protected file, the
//! manifest and the vault file come from disk, where a sync tool or an attacker may have put anything.
//! A fuzz target feeds them arbitrary bytes; they must refuse what they cannot read, never panic, and
//! never allocate more than their limits allow.

use super::encrypted_file::{FileHeader, open_file};
use super::key_slots::{DataKey, VAULT_ID_BYTES};
use super::manifest::Manifest;
use super::vault_file::Vault;

/// Reads `bytes` as each kind of protected input with a fixed key, as a fuzz target does.
pub fn read_untrusted_input(bytes: &[u8], data_key: &DataKey, vault_id: &[u8; VAULT_ID_BYTES]) {
    let _ = FileHeader::parse(bytes);
    let _ = open_file(bytes, data_key, vault_id);
    let _ = Manifest::open(bytes, data_key, vault_id);
    let _ = Vault::from_json(bytes);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protected_notes::encrypted_file::tests::{VAULT, header, metadata};
    use crate::protected_notes::{KdfParameters, Manifest, ManifestEntry, seal_file};

    /// A small generator with a fixed seed, so every run feeds the same inputs.
    struct Xorshift(u64);

    impl Xorshift {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }

        fn below(&mut self, limit: usize) -> usize {
            usize::try_from(self.next() % u64::try_from(limit.max(1)).unwrap()).unwrap()
        }
    }

    fn mutated(original: &[u8], random: &mut Xorshift) -> Vec<u8> {
        let mut bytes = original.to_vec();
        match random.below(4) {
            0 => {
                let place = random.below(bytes.len());
                if let Some(byte) = bytes.get_mut(place) {
                    *byte ^= u8::try_from(random.below(255) + 1).unwrap();
                }
            }
            1 => bytes.truncate(random.below(bytes.len())),
            2 => bytes
                .extend((0..random.below(300)).map(|_| u8::try_from(random.below(256)).unwrap())),
            _ => {
                let start = random.below(bytes.len());
                bytes.drain(start..(start + random.below(100)).min(bytes.len()));
            }
        }
        bytes
    }

    #[test]
    fn arbitrary_and_mutated_inputs_are_refused_without_panicking() {
        let key = DataKey::generate(1).unwrap();
        let note = seal_file(&header(2, &key), &metadata("Note"), b"text", &key).unwrap();
        let manifest = Manifest {
            revision: 1,
            entries: vec![ManifestEntry {
                note_id: [5; 16],
                revision: 2,
                title: "Note".to_owned(),
                folder: String::new(),
                kind: crate::protected_notes::FileKind::Note,
                modified_ms: 1,
            }],
        }
        .seal(&VAULT, &key)
        .unwrap();
        let vault = Vault::create("correct horse battery", KdfParameters::FLOOR)
            .unwrap()
            .vault
            .to_json()
            .unwrap();
        let seeds = [note, manifest, vault, Vec::new(), b"MDXP".to_vec()];
        let mut random = Xorshift(0x9E37_79B9_7F4A_7C15);

        for round in 0..3_000 {
            let seed = &seeds[round % seeds.len()];
            let input = mutated(seed, &mut random);
            read_untrusted_input(&input, &key, &VAULT);
            if input != *seed {
                assert!(open_file(&input, &key, &VAULT).is_err(), "round {round}");
            }
        }
    }
}
