// Shared setup for every test file (vitest `setupFiles`). Component tests wait for a server-action result, and under a
// full-suite run the screen settles a moment later than alone, so Testing Library waits up to 5s (MOM-96, after MOM-61).
// It only raises the ceiling: a wait that is met returns at once. Pure tests in the node environment are unaffected.

import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });
