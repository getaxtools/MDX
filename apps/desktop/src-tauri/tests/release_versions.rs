use std::fs;
use std::path::{Path, PathBuf};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

fn tauri_project_folder() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read_json(path: &Path) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn locked_app_version(cargo_lock: &str) -> Option<&str> {
    let mut lines = cargo_lock.lines();
    lines.find(|line| *line == r#"name = "mdx-desktop""#)?;
    lines
        .next()?
        .strip_prefix(r#"version = ""#)?
        .strip_suffix('"')
}

#[test]
fn root_package_json_has_the_app_version() {
    let package_json = read_json(&tauri_project_folder().join("../../../package.json")).unwrap();

    assert_eq!(package_json["version"], APP_VERSION);
}

#[test]
fn tauri_config_has_the_app_version() {
    let tauri_config = read_json(&tauri_project_folder().join("tauri.conf.json")).unwrap();

    assert_eq!(tauri_config["version"], APP_VERSION);
}

#[test]
fn cargo_lock_has_the_app_version() {
    let cargo_lock = fs::read_to_string(tauri_project_folder().join("Cargo.lock")).unwrap();

    assert_eq!(locked_app_version(&cargo_lock), Some(APP_VERSION));
}

#[test]
fn release_manifest_has_the_app_version() {
    let manifest =
        read_json(&tauri_project_folder().join("../../../.release-please-manifest.json")).unwrap();

    assert_eq!(manifest["."], APP_VERSION);
}
