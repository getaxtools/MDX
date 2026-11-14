use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

/// Pictures the user dropped on the window. The page may ask to copy only these, so it can never
/// read other files through the attachment command.
#[derive(Debug, Default)]
pub struct DroppedImages(Mutex<HashSet<PathBuf>>);

impl DroppedImages {
    pub fn remember(&self, paths: impl IntoIterator<Item = PathBuf>) {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .extend(paths);
    }

    /// True once for each remembered picture; a second request for it is refused.
    pub fn take(&self, path: &Path) -> bool {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_each_dropped_picture_once_and_nothing_else() {
        let dropped = DroppedImages::default();
        dropped.remember([PathBuf::from("C:/Pictures/chart.png")]);

        assert!(dropped.take(Path::new("C:/Pictures/chart.png")));
        assert!(!dropped.take(Path::new("C:/Pictures/chart.png")));
        assert!(!dropped.take(Path::new("C:/Windows/secret.png")));
    }
}
