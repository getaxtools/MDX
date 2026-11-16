# Spec Delta

## MODIFIED Requirements

### Requirement: Open tabs
The viewer SHALL open each document in its own tab, after the pinned tabs.

#### Scenario: Open a file
- **WHEN** the user opens a file
- **THEN** it appears in a new tab after the pinned tabs

#### Scenario: Open twice
- **WHEN** the user opens a file that is already open
- **THEN** its tab is selected

## ADDED Requirements

### Requirement: Pin tabs
The viewer SHALL let the user pin a tab.

#### Scenario: Pin a tab
- **GIVEN** an open tab
- **WHEN** the user pins it
- **THEN** it moves to the start
