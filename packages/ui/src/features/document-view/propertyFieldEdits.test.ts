import type { EditableProperty } from '@mdx/core';
import { describe, expect, it } from 'vitest';
import { canEditInField, propertyFieldEdit, propertyFieldText } from './propertyFieldEdits';

const STATUS: EditableProperty = { key: 'status', kind: 'value', value: 'draft' };
const TAGS: EditableProperty = { key: 'tags', kind: 'list', values: ['work', 'q4'] };

describe('property fields', () => {
  it('shows a list as its items separated by commas', () => {
    expect(propertyFieldText(TAGS)).toBe('work, q4');
  });

  it('a changed value sets the value without surrounding spaces', () => {
    expect(propertyFieldEdit(STATUS, ' done ')).toEqual({ kind: 'setValue', key: 'status', value: 'done' });
  });

  it('typing the same value asks for no edit', () => {
    expect(propertyFieldEdit(STATUS, 'draft')).toBeUndefined();
    expect(propertyFieldEdit(STATUS, 'draft ')).toBeUndefined();
  });

  it('a changed list sets its items, dropping empty ones', () => {
    expect(propertyFieldEdit(TAGS, 'work,, q1 ,')).toEqual({
      kind: 'setList',
      key: 'tags',
      values: ['work', 'q1'],
    });
  });

  it('a list typed with other spacing but the same items asks for no edit', () => {
    expect(propertyFieldEdit(TAGS, 'work,q4')).toBeUndefined();
  });

  it.each([
    [[' a', 'b'], ' a, c', [' a', 'c']],
    [['', 'b'], ', c', ['', 'c']],
    [['x ', '  y  '], 'x ,   y  , z', ['x ', '  y  ', 'z']],
  ])('untouched items of %j keep their exact values', (values, typedText, expected) => {
    const property: EditableProperty = { key: 'tags', kind: 'list', values };

    expect(propertyFieldEdit(property, typedText)).toEqual({
      kind: 'setList',
      key: 'tags',
      values: expected,
    });
  });

  it('a list item holding a comma cannot be edited in a field', () => {
    expect(canEditInField({ key: 'aliases', kind: 'list', values: ['Plan, 2026'] })).toBe(false);
    expect(canEditInField(TAGS)).toBe(true);
    expect(canEditInField({ key: 'title', kind: 'value', value: 'Plan, 2026' })).toBe(true);
  });
});
