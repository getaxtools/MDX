use std::collections::BTreeMap;
use std::sync::Mutex;

use super::lock;

/// What each window asks to watch. The watcher gets every window's set together, so one window's
/// request never stops live reload in another, and each change goes only to the windows watching it.
#[derive(Debug)]
pub struct WindowWatchSets<Item>(Mutex<BTreeMap<String, Vec<Item>>>);

impl<Item> Default for WindowWatchSets<Item> {
    fn default() -> Self {
        Self(Mutex::new(BTreeMap::new()))
    }
}

impl<Item: Clone + PartialEq> WindowWatchSets<Item> {
    /// Replaces the window's set and hands what all windows watch now to `watch`, still under the lock,
    /// so two windows asking at once cannot leave the watcher on an older set.
    pub fn replace_and(&self, window_label: &str, items: Vec<Item>, watch: impl FnOnce(Vec<Item>)) {
        let mut sets = lock(&self.0);
        sets.insert(window_label.to_owned(), items);
        watch(combined(&sets));
    }

    /// Drops a closed window's set and hands what the other windows still watch to `watch`.
    pub fn forget_and(&self, window_label: &str, watch: impl FnOnce(Vec<Item>)) {
        let mut sets = lock(&self.0);
        sets.remove(window_label);
        watch(combined(&sets));
    }

    /// Each window with the changed paths it watches; windows watching none of them are left out.
    pub fn share_of(
        &self,
        changed: &[String],
        path_of: impl Fn(&Item) -> &str,
    ) -> Vec<(String, Vec<String>)> {
        lock(&self.0)
            .iter()
            .filter_map(|(window_label, items)| {
                let share: Vec<String> = changed
                    .iter()
                    .filter(|path| items.iter().any(|item| path_of(item) == path.as_str()))
                    .cloned()
                    .collect();
                (!share.is_empty()).then(|| (window_label.clone(), share))
            })
            .collect()
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
    use std::sync::Arc;
    use std::thread;

    use super::*;

    fn paths(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| (*item).to_owned()).collect()
    }

    fn replace(sets: &WindowWatchSets<String>, window_label: &str, items: &[&str]) -> Vec<String> {
        let mut watched = Vec::new();
        sets.replace_and(window_label, paths(items), |all| watched = all);
        watched
    }

    #[test]
    fn one_window_watching_new_documents_keeps_the_other_windows_documents() {
        let sets = WindowWatchSets::default();
        replace(&sets, "main", &["a.md", "b.md"]);

        assert_eq!(
            replace(&sets, "window-2", &["b.md", "c.md"]),
            paths(&["a.md", "b.md", "c.md"])
        );
        assert_eq!(replace(&sets, "window-2", &[]), paths(&["a.md", "b.md"]));
    }

    #[test]
    fn a_closed_window_stops_watching_only_its_own_documents() {
        let sets = WindowWatchSets::default();
        replace(&sets, "main", &["a.md"]);
        replace(&sets, "window-2", &["c.md"]);
        let mut watched = Vec::new();

        sets.forget_and("window-2", |all| watched = all);

        assert_eq!(watched, paths(&["a.md"]));
    }

    #[test]
    fn windows_asking_at_once_leave_the_watcher_on_every_window_set() {
        let sets = Arc::new(WindowWatchSets::default());
        let watcher = Arc::new(Mutex::new(Vec::new()));
        let askers: Vec<_> = (0..8)
            .map(|window| {
                let sets = Arc::clone(&sets);
                let watcher = Arc::clone(&watcher);
                thread::spawn(move || {
                    for round in 0..50 {
                        let label = format!("window-{window}");
                        let items = vec![format!("{window}-{round}.md")];
                        sets.replace_and(&label, items, |all| *lock(&watcher) = all);
                    }
                })
            })
            .collect();
        for asker in askers {
            asker.join().unwrap();
        }

        let mut watched = lock(&watcher).clone();
        watched.sort();
        let mut expected: Vec<String> = (0..8).map(|window| format!("{window}-49.md")).collect();
        expected.sort();
        assert_eq!(watched, expected);
    }

    #[test]
    fn each_window_gets_only_the_changes_it_watches() {
        let sets = WindowWatchSets::default();
        replace(&sets, "main", &["a.md", "b.md"]);
        replace(&sets, "window-2", &["b.md"]);
        replace(&sets, "window-3", &["c.md"]);

        let shares = sets.share_of(&paths(&["a.md", "b.md"]), String::as_str);

        assert_eq!(
            shares,
            vec![
                ("main".to_owned(), paths(&["a.md", "b.md"])),
                ("window-2".to_owned(), paths(&["b.md"])),
            ]
        );
    }
}
