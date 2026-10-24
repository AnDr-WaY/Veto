/**
 * Veto design system — public surface.
 * Import UI pieces from here: `import {Button, useTheme} from '@/src/ui';`
 * (or a relative path, depending on the importer).
 */

// Tokens & foundation
export * from './tokens';
export * from './Theme';
export * from './motion';
export {haptics} from './haptics';

// Primitives
export * from './components/Button';
export * from './components/Card';
export * from './components/Row';
export * from './components/Sheet';
export * from './components/FAB';
export * from './components/ExpandableFab';
export * from './components/Glass';
export * from './components/Icon';
export * from './components/IconButton';
export * from './components/ScreenHeader';

// Domain components
export * from './components/BlockChip';
export * from './components/TimelineBar';
export * from './components/DayDial';
export * from './components/TimeStepper';
export * from './components/TimePickerWheel';
export * from './components/StrictnessCard';
export * from './components/ShieldLayout';
export * from './components/EmptyState';

// Gallery (renders every component above)
export * from './Demo';
