/**
 * Shorthand ambient declaration: react-test-renderer arrives transitively
 * (via react-native) without bundled types. We only use `create`/`toJSON`
 * in snapshot tests, so `any` is acceptable here.
 * Owned by chapter 2 (design system tests).
 */
declare module 'react-test-renderer';
