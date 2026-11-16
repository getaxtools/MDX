import { configure } from '@testing-library/svelte';

// Components that load lazily or let CodeMirror parse first can take seconds under coverage on a
// busy machine; findBy and waitFor still return as soon as their condition holds.
configure({ asyncUtilTimeout: 5_000 });
