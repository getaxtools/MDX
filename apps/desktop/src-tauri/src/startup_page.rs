use std::error::Error;

use tauri::http::{Request, Response, StatusCode, header};
use tauri::utils::config::WindowConfig;
use tauri::webview::PageLoadEvent;
use tauri::{App, Url, WebviewUrl, WebviewWindowBuilder, Wry};

pub const STARTUP_PAGE_PROTOCOL: &str = "mdx-startup";
const STARTUP_PAGE_HTML: &str = include_str!("../../index.html");
const STARTUP_SCREEN_ELEMENT_ID: &str = "startup-screen";

/// Opens the window on a start-up page the app serves itself, so a slow development server never shows a blank window.
pub fn open_on_startup_page<'a>(
    app: &'a App,
    window_config: &WindowConfig,
) -> Result<WebviewWindowBuilder<'a, Wry, App>, Box<dyn Error>> {
    let Some(development_url) = app.config().build.dev_url.clone() else {
        return Ok(WebviewWindowBuilder::from_config(app, window_config)?);
    };
    let startup_page = startup_page_url()?;
    let app_page = app_page_url(development_url);
    let mut startup_window_config = window_config.clone();
    startup_window_config.url = WebviewUrl::CustomProtocol(startup_page.clone());

    Ok(
        WebviewWindowBuilder::from_config(app, &startup_window_config)?.on_page_load(
            move |window, payload| {
                if payload.event() == PageLoadEvent::Finished
                    && is_same_site(payload.url(), &startup_page)
                    && let Err(error) = window.navigate(app_page.clone())
                {
                    eprintln!("MDX could not open {app_page}: {error}");
                }
            },
        ),
    )
}

pub fn serve_startup_page(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.uri().path() != "/" {
        let mut response = Response::new(Vec::new());
        *response.status_mut() = StatusCode::NOT_FOUND;
        return response;
    }
    let mut response = Response::new(STARTUP_PAGE_HTML.as_bytes().to_vec());
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("text/html"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        header::HeaderValue::from_static("default-src 'none'; style-src 'unsafe-inline'"),
    );
    response
}

fn startup_page_url() -> Result<Url, Box<dyn Error>> {
    // WebView2 and Android serve custom protocols as http://<protocol>.localhost.
    let address = if cfg!(any(windows, target_os = "android")) {
        format!("http://{STARTUP_PAGE_PROTOCOL}.localhost/")
    } else {
        format!("{STARTUP_PAGE_PROTOCOL}://localhost/")
    };
    Ok(Url::parse(&address)?)
}

fn app_page_url(mut development_url: Url) -> Url {
    // The page's stylesheet shows the screen at once when it is the :target, so it does not blink at the handover.
    development_url.set_fragment(Some(STARTUP_SCREEN_ELEMENT_ID));
    development_url
}

fn is_same_site(url: &Url, other: &Url) -> bool {
    url.scheme() == other.scheme() && url.host_str() == other.host_str()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_for(path: &str) -> Request<Vec<u8>> {
        Request::builder()
            .uri(format!("http://mdx-startup.localhost{path}"))
            .body(Vec::new())
            .unwrap()
    }

    #[test]
    fn serves_the_start_up_screen_page() {
        let response = serve_startup_page(&request_for("/"));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "text/html");
        let page = String::from_utf8_lossy(response.body());
        assert!(page.contains(r#"id="startup-screen""#));
        assert!(page.contains(".startup-screen {"));
    }

    #[test]
    fn blocks_scripts_on_the_start_up_page() {
        let response = serve_startup_page(&request_for("/"));

        let policy = response.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap();
        assert!(policy.contains("default-src 'none'"));
        assert!(!policy.contains("script-src"));
    }

    #[test]
    fn serves_nothing_else() {
        let response = serve_startup_page(&request_for("/src/main.ts"));

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(response.body().is_empty());
    }

    #[test]
    fn opens_the_app_page_on_the_start_up_screen() {
        let app_page = app_page_url(Url::parse("http://localhost:5173").unwrap());

        assert_eq!(app_page.as_str(), "http://localhost:5173/#startup-screen");
    }

    #[test]
    fn tells_the_start_up_page_from_the_app_page() {
        let startup_page = startup_page_url().unwrap();

        assert!(is_same_site(&startup_page, &startup_page));
        assert!(!is_same_site(
            &Url::parse("http://localhost:5173/#startup-screen").unwrap(),
            &startup_page
        ));
    }
}
