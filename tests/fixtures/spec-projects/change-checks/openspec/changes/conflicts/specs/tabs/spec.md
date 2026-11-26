# Spec Delta

## ADDED Requirements

### Requirement: Shared name ##
The viewer SHALL share.

#### Scenario: Share
- **WHEN** shared
- **THEN** shared

### Requirement: New name
The viewer SHALL collide.

#### Scenario: Collide
- **WHEN** collided
- **THEN** collided

```markdown
### Requirement: Fenced example
```

## MODIFIED Requirements

### Requirement: Close tabs
The viewer SHALL close a tab with Ctrl+W or the close button.

#### Scenario: Close the current tab
- **WHEN** the user presses Ctrl+W
- **THEN** the current tab closes

### Requirement: Open tabs
The viewer SHALL open each document in its own tab.

#### Scenario: Open a file
- **WHEN** the user opens a file
- **THEN** it appears in a new tab

#### Scenario: Open twice
- **WHEN** the user opens a file that is already open
- **THEN** its tab is selected

## REMOVED Requirements

- ### Requirement: Shared name
* ### Requirement: Open tabs
+ ### Requirement: Old layout

## RENAMED Requirements

- FROM: `### Requirement: Close tabs`
- TO: `### Requirement: New name`
* FROM: `### Requirement: Close tabs`
+ TO: `### Requirement: Shut tabs`
FROM: `### Requirement: old layout`
TO: `### Requirement: Fresh layout`
