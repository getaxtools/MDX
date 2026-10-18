mod app_setup;
mod commands;
mod document_images;
mod documents;
mod live_reload;
mod menu;
mod open_requests;
mod platform;
mod storage;

use std::sync::Arc;

use documents::DocumentAccessList;
use tauri::{Builder, Manager, Wry};

pub fn run() {
    let builder = with_plugins(Builder::default())
        .setup(|app| {
            app_setup::initialize(app)?;
            menu::install_main_menu(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle_menu_event(app, &event))
        .on_window_event(open_requests::handle_window_event);

    let result = with_commands(with_image_protocol(builder)).run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("MDX could not start: {error}");
        std::process::exit(1);
    }
}

fn with_plugins(builder: Builder<Wry>) -> Builder<Wry> {
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(
            |app, arguments, working_folder| {
                open_requests::forward_second_instance(app, &arguments, &working_folder);
            },
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    with_ui_test_driver(builder)
}

fn with_image_protocol(builder: Builder<Wry>) -> Builder<Wry> {
    builder.register_asynchronous_uri_scheme_protocol(
        document_images::IMAGE_PROTOCOL,
        |context, request, responder| {
            let access = Arc::clone(&context.app_handle().state::<Arc<DocumentAccessList>>());
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(document_images::serve_image(&request, &access));
            });
        },
    )
}

fn with_commands(builder: Builder<Wry>) -> Builder<Wry> {
    builder.invoke_handler(tauri::generate_handler![
        commands::documents::open_document,
        commands::documents::pick_documents,
        commands::documents::check_path_statuses,
        commands::documents::take_startup_documents,
        commands::documents::save_document_as,
        commands::app_state::load_app_state,
        commands::app_state::save_app_state,
        commands::app_info::get_app_info,
        commands::live_reload::watch_documents,
        commands::links::resolve_document_link,
        commands::links::open_external_link,
        commands::folders::pick_folder,
        commands::folders::list_folder_contents,
        menu::update_view_menu,
        menu::recent_files_menu::update_recent_menu,
    ])
}

#[cfg(all(debug_assertions, feature = "webdriver"))]
fn with_ui_test_driver(builder: Builder<Wry>) -> Builder<Wry> {
    builder.plugin(tauri_plugin_wdio_webdriver::init())
}

#[cfg(not(all(debug_assertions, feature = "webdriver")))]
fn with_ui_test_driver(builder: Builder<Wry>) -> Builder<Wry> {
    builder
}
