export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'tabs',
        'favourites',
        'recent-files',
        'documents',
        'renderer',
        'i18n',
        'ui',
        'desktop',
        'settings',
        'about',
        'deps',
        'ci',
        'release',
      ],
    ],
    'signed-off-by': [2, 'always', 'Signed-off-by:'],
  },
};
