# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Close tabs`
- TO: `### Requirement: Shut tabs`

## MODIFIED Requirements

### Requirement: Shut tabs
The viewer SHALL close a tab with Ctrl+W or its close button.

#### Scenario: Close the current tab
- **WHEN** the user presses Ctrl+W
- **THEN** the current tab closes

## REMOVED Requirements

- ### Requirement: Old layout

## ADDED Requirements

### Requirement: Pin tabs
The viewer SHALL let the user pin a tab.

#### Scenario: Pin a tab
- **WHEN** the user pins a tab
- **THEN** it moves to the start
