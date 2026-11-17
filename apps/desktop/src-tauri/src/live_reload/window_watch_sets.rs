use std::collections::BTreeMap;
use std::sync::Mutex;

use super::lock;

/// What each window asks to watch. The watcher gets every window's set together, so one window's
/// request never stops live reload in another.
#[derive(Debug)]
pub struct WindowWatchSets<Item>(Mutex<BTreeMap<String, Vec<Item>>>);

impl<Item> Default for WindowWatchSets<Item> {
    fn default() -> Self {
        Self(Mutex::new(BTreeMap::new()))
    }
}

impl<Item: Clone + PartialEq> WindowWatchSets<Item> {
    /// Replaces the window's set and gives what all windows watch now.
    pub fn replace(&self, window_label: &str, items: Vec<Item>) -> Vec<Item> {
        let mut sets = lock(&self.0);
        sets.insert(window_label.to_owned(), items);
        combined(&sets)
    }

    /// Drops a closed window's set and gives what the other windows still watch.
    pub fn forget(&self, window_label: &str) -> Vec<Item> {
        let mut sets = lock(&self.0);
        sets.remove(window_label);
        combined(&sets)
    }
}

fn combined<Item: Clone + PartialEq>(sets: &BTreeMap<String, Vec<Item>>) -> Vec<Item> {
    let mut all: Vec<Item> = Vec::new();
    for item in sets.values().flatten() {
        if !all.contains(item) {
            all.push(item.clone());
        }
    }
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_owned()).collect()
    }

    #[test]
    fn one_window_watching_new_documents_keeps_the_other_windows_documents() {
        let sets = WindowWatchSets::default();
        sets.replace("main", paths(&["a.md", "b.md"]));

        let watched = sets.replace("window-2", paths(&["b.md", "c.md"]));

        assert_eq!(watched, paths(&["a.md", "b.md", "c.md"]));
        assert_eq!(
            sets.replace("window-2", paths(&[])),
            paths(&["a.md", "b.md"])
        );
    }

    #[test]
    fn a_closed_window_stops_watching_only_its_own_documents() {
        let sets = WindowWatchSets::default();
        sets.replace("main", paths(&["a.md"]));
        sets.replace("window-2", paths(&["c.md"]));

        assert_eq!(sets.forget("window-2"), paths(&["a.md"]));
    }
}
