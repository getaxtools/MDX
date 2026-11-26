# tabs Specification

## Purpose

Lets a user keep several documents open at once in tabs and move between them quickly.

## Requirements

### Requirement: Open tabs
The viewer SHALL open each document in its own tab.

#### Scenario: Open a file
- **WHEN** the user opens a file
- **THEN** it appears in a new tab

#### Scenario: Open twice
- **WHEN** the user opens a file that is already open
- **THEN** its tab is selected

### Requirement: Close tabs
The viewer SHALL close a tab with Ctrl+W.

#### Scenario: Close the current tab
- **WHEN** the user presses Ctrl+W
- **THEN** the current tab closes

### Requirement: Old layout
The viewer SHALL keep the old layout.

#### Scenario: Old layout kept
- **WHEN** the user opens the viewer
- **THEN** the old layout shows
