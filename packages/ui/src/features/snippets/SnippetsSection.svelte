<script lang="ts">
  import {
    BUILT_IN_SNIPPETS,
    snippetRefusal,
    type Snippet,
    type SnippetLibrary,
    type SnippetRefusal,
  } from '@mdx/core';
  import type { MessageKey, Translator } from '@mdx/i18n';
  import { snippetNameOf } from '../command-palette/paletteCommands';
  import type { ViewerCommand } from '../viewer/viewerCommands';

  interface Props {
    library: SnippetLibrary;
    translator: Translator;
    onCommand: (command: ViewerCommand) => void;
  }

  const { library, translator, onCommand }: Props = $props();

  const REFUSAL_MESSAGES: Readonly<Record<SnippetRefusal, MessageKey>> = {
    nameMissing: 'snippets.refused.nameMissing',
    nameTaken: 'snippets.refused.nameTaken',
    nameTooLong: 'snippets.refused.nameTooLong',
    bodyTooLong: 'snippets.refused.bodyTooLong',
    tooMany: 'snippets.refused.tooMany',
  };

  let draft: Snippet | undefined = $state();
  let refusal: SnippetRefusal | undefined = $state();

  function startNew() {
    draft = { id: `user.${String(Date.now())}`, name: '', trigger: '', body: '' };
    refusal = undefined;
  }

  function startEditing(snippet: Snippet) {
    draft = { ...snippet };
    refusal = undefined;
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft) return;
    refusal = snippetRefusal(library, draft);
    if (refusal) return;
    onCommand({ kind: 'saveSnippet', snippet: draft });
    draft = undefined;
  }
</script>

<section aria-labelledby="settings-section-snippets">
  <h3 id="settings-section-snippets">{translator.translate('settings.section.snippets')}</h3>
  <p class="description">{translator.translate('snippets.description')}</p>
  <ul>
    {#each BUILT_IN_SNIPPETS as snippet (snippet.id)}
      {@const isHidden = library.hiddenBuiltInIds.includes(snippet.id)}
      <li>
        <span class="name">{snippetNameOf(snippet, translator)}</span>
        <span class="kind">{translator.translate('snippets.builtIn')}</span>
        <button
          onclick={() =>
            onCommand({ kind: 'setBuiltInSnippetHidden', snippetId: snippet.id, isHidden: !isHidden })}
        >
          {translator.translate(isHidden ? 'snippets.show' : 'snippets.hide')}
        </button>
      </li>
    {/each}
    {#each library.snippets as snippet (snippet.id)}
      <li>
        <span class="name">{snippet.name}</span>
        <span class="kind">{snippet.trigger}</span>
        <button
          aria-label={translator.translate('snippets.editNamed', { name: snippet.name })}
          onclick={() => startEditing(snippet)}
        >
          {translator.translate('snippets.edit')}
        </button>
        <button
          aria-label={translator.translate('snippets.deleteNamed', { name: snippet.name })}
          onclick={() => onCommand({ kind: 'deleteSnippet', snippetId: snippet.id })}
        >
          {translator.translate('snippets.delete')}
        </button>
      </li>
    {/each}
  </ul>
  {#if draft}
    <form aria-label={translator.translate('snippets.form')} onsubmit={save}>
      <label>
        {translator.translate('snippets.name')}
        <input bind:value={draft.name} />
      </label>
      <label>
        {translator.translate('snippets.trigger')}
        <input bind:value={draft.trigger} />
      </label>
      <label>
        {translator.translate('snippets.body')}
        <textarea bind:value={draft.body} rows="5" spellcheck="false" aria-describedby="snippet-body-help"
        ></textarea>
      </label>
      <p id="snippet-body-help" class="description">{translator.translate('snippets.bodyHelp')}</p>
      <p class="refusal" role="alert">{refusal ? translator.translate(REFUSAL_MESSAGES[refusal]) : ''}</p>
      <div class="actions">
        <button type="submit">{translator.translate('snippets.save')}</button>
        <button type="button" onclick={() => (draft = undefined)}
          >{translator.translate('snippets.cancel')}</button
        >
      </div>
    </form>
  {:else}
    <button class="new" onclick={startNew}>{translator.translate('snippets.new')}</button>
  {/if}
</section>

<style>
  h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .name {
    flex: 1;
  }

  .kind,
  .description {
    color: var(--color-text-secondary);
    font-size: var(--text-size-small);
  }

  form {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  label {
    display: grid;
    gap: var(--space-1);
  }

  input,
  textarea {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
  }

  textarea {
    font-family: var(--font-mono);
  }

  .refusal,
  .description {
    margin: 0;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  button {
    height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-medium);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
  }

  .new {
    margin-top: var(--space-2);
  }

  :is(input, textarea, button):focus-visible {
    outline: 2px solid var(--color-focus);
  }
</style>
