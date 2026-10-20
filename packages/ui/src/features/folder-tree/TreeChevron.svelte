<script lang="ts">
  interface Props {
    isExpanded: boolean;
  }

  const { isExpanded }: Props = $props();
</script>

<svg class="tree-chevron" class:expanded={isExpanded} viewBox="0 0 16 16" aria-hidden="true">
  <path d="M6 4l4 4-4 4" />
</svg>

<style>
  .tree-chevron {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    color: var(--color-text-secondary);
  }

  .tree-chevron.expanded {
    transform: rotate(90deg);
  }

  .tree-chevron:dir(rtl):not(.expanded) {
    transform: scaleX(-1);
  }

  @media (prefers-reduced-motion: no-preference) {
    .tree-chevron {
      transition: transform 120ms ease-out;
    }
  }
</style>
