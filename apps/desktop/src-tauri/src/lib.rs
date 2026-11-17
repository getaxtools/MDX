mod app_setup;
mod attachments;
mod commands;
mod document_images;
mod documents;
mod live_reload;
mod main_window;
mod menu;
mod notes;
mod notes_index;
mod notes_location;
mod notes_transfer;
mod open_requests;
mod platform;
mod spec_projects;
#[cfg(dev)]
mod startup_page;
mod storage;

use std::sync::Arc;

use documents::DocumentAccessList;
use storage::WorkspaceDatabase;
use tauri::{Builder, Manager, RunEvent, Wry};

pub fn run() {
    let builder = with_plugins(Builder::default())
        .setup(|app| {
            main_window::create_main_window(app)?;
            app_setup::initialize(app)?;
            menu::install_main_menu(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle_menu_event(app, &event))
        .on_window_event(open_requests::handle_window_event);

    let result = with_commands(with_startup_page_protocol(with_image_protocol(builder)))
        .build(tauri::generate_context!());

    match result {
        Ok(app) => app.run(|app, event| {
            if let (RunEvent::Exit, Some(database)) = (event, app.try_state::<WorkspaceDatabase>())
            {
                let _ = database.close();
            }
        }),
        Err(error) => {
            eprintln!("MDX could not start: {error}");
            std::process::exit(1);
        }
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

#[cfg(dev)]
fn with_startup_page_protocol(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        .register_uri_scheme_protocol(startup_page::STARTUP_PAGE_PROTOCOL, |_context, request| {
            startup_page::serve_startup_page(&request)
        })
}

#[cfg(not(dev))]
fn with_startup_page_protocol(builder: Builder<Wry>) -> Builder<Wry> {
    builder
}

#[expect(
    clippy::too_many_lines,
    reason = "one line per command, and Tauri takes them all in one list"
)]
fn with_commands(builder: Builder<Wry>) -> Builder<Wry> {
    builder.invoke_handler(tauri::generate_handler![
        commands::attachments::save_attachment,
        commands::attachments::add_picture_files,
        commands::documents::open_document,
        commands::documents::pick_documents,
        commands::documents::check_path_statuses,
        commands::documents::take_startup_documents,
        commands::documents::save_document_as,
        commands::document_saving::save_document,
        commands::document_export::export_document,
        commands::favourites_file::export_favourites,
        commands::favourites_file::import_favourites,
        commands::app_state::load_app_state,
        commands::app_state::save_app_state,
        commands::app_state::remove_app_state_backups,
        commands::app_state::grant_app_state_access,
        commands::workspaces::import_legacy_state,
        commands::workspaces::clear_workspaces,
        commands::workspaces::grant_workspace_access,
        commands::workspace_file::pick_workspace_export_place,
        commands::workspace_file::write_workspace_export,
        commands::workspace_file::open_workspace_file,
        commands::workspace_file::take_startup_workspace_file,
        commands::notes_location::known_folders,
        commands::notes_location::prepare_notes_location,
        commands::notes_location::check_notes_location,
        commands::notes_location::inspect_notes_folder,
        commands::notes_location::locate_notes_location,
        commands::notes_move::plan_notes_move,
        commands::notes_move::run_notes_move,
        commands::notes_move::stop_notes_move,
        commands::notes_move::cancel_notes_move,
        commands::notes_move::switch_notes_move,
        commands::notes_move::finish_notes_move_switch,
        commands::notes_move::unfinished_notes_moves,
        commands::notes_move::keep_old_notes_copy,
        commands::notes_move::remove_old_notes_copy,
        commands::notes_move::clear_notes_moves,
        commands::notes::create_note,
        commands::notes::create_note_in_folder,
        commands::notes::rename_note,
        commands::notes::move_note,
        commands::notes::delete_note,
        commands::notes::list_note_trash,
        commands::notes::restore_note,
        commands::notes::empty_note_trash,
        commands::notes::apply_note_link_updates,
        commands::notes_transfer::pick_notes_import_folder,
        commands::notes_transfer::import_notes_folder,
        commands::notes_transfer::cancel_notes_import,
        commands::notes_transfer::pick_notes_export_folder,
        commands::notes_transfer::export_notes_to_folder,
        commands::notes_index::show_notes_index,
        commands::notes_index::hide_notes_index,
        commands::notes_index::refresh_notes_index,
        commands::notes_index::clear_notes_indexes,
        commands::notes_index::search_notes,
        commands::notes_index::note_backlinks,
        commands::notes_index::note_tags,
        commands::notes_index::note_suggestions,
        commands::notes_index::note_headings,
        commands::notes_index::plan_note_link_updates,
        commands::spec_projects::scan_spec_project,
        commands::spec_projects::read_spec_project_file,
        commands::spec_project_link::follow_spec_project_link,
        commands::spec_projects::watch_spec_projects,
        commands::spec_projects::search_spec_project_documents,
        commands::workspaces::load_workspace_registry,
        commands::workspaces::load_workspace,
        commands::workspaces::save_workspace,
        commands::workspaces::delete_workspace,
        commands::workspaces::save_workspace_list,
        commands::workspaces::save_window_session,
        commands::workspaces::load_app_values,
        commands::workspaces::save_app_value,
        commands::app_info::get_app_info,
        commands::live_reload::watch_documents,
        commands::live_reload::watch_folders,
        commands::links::resolve_document_link,
        commands::links::inspect_document_link,
        commands::links::open_external_link,
        commands::folders::pick_folder,
        commands::folders::list_folder_contents,
        commands::document_search::find_folder_documents,
        commands::folder_text_search::search_folder_documents,
        commands::file_manager::reveal_in_file_manager,
        commands::window::toggle_full_screen,
        commands::window::set_window_title,
        menu::update_view_menu,
        menu::update_menu_language,
        menu::update_menu_shortcuts,
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
