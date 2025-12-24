import { normalizeKeyValue } from '$lib/text/keyState';

// ============================================================================
// Type Definitions
// ============================================================================

export type KeyCell = {
    kind: 'key';
    value: string;
    label: string;
    width: number;
    rowSpan?: number;
    classes?: string[];
};

export type SpacerCell = {
    kind: 'spacer';
    width: number;
    rowSpan?: number;
};

export type KeyRow = {
    row: number;
    cells: Array<KeyCell | SpacerCell>;
};

type KeyOptions = {
    label?: string;
    width?: number;
    rowSpan?: number;
    classes?: string[];
};

// ============================================================================
// Helper Functions
// ============================================================================

function createKey(keyLike: string, options?: KeyOptions): KeyCell {
    const normalized = normalizeKeyValue(keyLike);
    const label = options?.label ?? (normalized.trim() === '' ? 'Space' : normalized);
    return {
        kind: 'key',
        value: normalized,
        label,
        width: options?.width ?? 2,
        rowSpan: options?.rowSpan,
        classes: options?.classes ?? []
    };
}

function createSpacer(width: number, rowSpan?: number): SpacerCell {
    return { kind: 'spacer', width, rowSpan };
}

function rowCells(
    ...cells: Array<KeyCell | SpacerCell | Array<KeyCell | SpacerCell>>
): Array<KeyCell | SpacerCell> {
    return cells.flat();
}

// ============================================================================
// Main Keyboard Layout Data
// ============================================================================

const mainKeyboardRows: Array<{ cells: Array<KeyCell | SpacerCell> }> = [
    {
        cells: rowCells(
            createKey('Escape', { label: 'Esc', width: 2 }),
            createSpacer(4),
            ['F1', 'F2', 'F3', 'F4'].map((label) => createKey(label, { width: 2 })),
            createSpacer(1),
            ['F5', 'F6', 'F7', 'F8'].map((label) => createKey(label, { width: 2 })),
            createSpacer(1),
            ['F9', 'F10', 'F11', 'F12'].map((label) => createKey(label, { width: 2 })),
            createSpacer(2),
            createKey('PrintScreen', { label: 'PrtSc', width: 2, classes: ['nav'] }),
            createKey('ScrollLock', { label: 'ScrLk', width: 2, classes: ['nav'] }),
            createKey('Pause', { label: 'Pause', width: 2, classes: ['nav'] }),
            createSpacer(2),
            createSpacer(8)
        )
    },
    {
        cells: rowCells(
            createKey('Backquote', { label: '`', width: 2 }),
            [
                'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
                'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'
            ].map((code) => createKey(code, { width: 2 })),
            createKey('Minus', { label: '-', width: 2 }),
            createKey('Equal', { label: '=', width: 2 }),
            createKey('Backspace', { label: 'Backspace', width: 6 }),
            createSpacer(2),
            createKey('Insert', { label: 'Ins', width: 2, classes: ['nav'] }),
            createKey('Home', { label: 'Home', width: 2, classes: ['nav'] }),
            createKey('PageUp', { label: 'PgUp', width: 2, classes: ['nav'] }),
            createSpacer(2),
            createKey('NumLock', { label: 'Num', width: 2, classes: ['numpad'] }),
            createKey('NumpadDivide', { label: '/', width: 2, classes: ['numpad'] }),
            createKey('NumpadMultiply', { label: '*', width: 2, classes: ['numpad'] }),
            createKey('NumpadSubtract', { label: '-', width: 2, classes: ['numpad'] })
        )
    },
    {
        cells: rowCells(
            createKey('Tab', { label: 'Tab', width: 4 }),
            [
                'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY',
                'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'
            ].map((code) => createKey(code, { width: 2 })),
            createKey('Backslash', { label: '\\', width: 4 }),
            createSpacer(2),
            createKey('Delete', { label: 'Del', width: 2, classes: ['nav'] }),
            createKey('End', { label: 'End', width: 2, classes: ['nav'] }),
            createKey('PageDown', { label: 'PgDn', width: 2, classes: ['nav'] }),
            createSpacer(2),
            createKey('Numpad7', { label: '7', width: 2, classes: ['numpad'] }),
            createKey('Numpad8', { label: '8', width: 2, classes: ['numpad'] }),
            createKey('Numpad9', { label: '9', width: 2, classes: ['numpad'] }),
            createKey('NumpadAdd', { label: '+', width: 2, rowSpan: 2, classes: ['numpad'] })
        )
    },
    {
        cells: rowCells(
            createKey('CapsLock', { label: 'Caps', width: 4 }),
            [
                'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG',
                'KeyH', 'KeyJ', 'KeyK', 'KeyL'
            ].map((code) => createKey(code, { width: 2 })),
            createKey('Semicolon', { label: ';', width: 2 }),
            createKey('Quote', { label: "'", width: 2 }),
            createKey('Enter', { label: 'Enter', width: 4 }),
            createSpacer(4),
            createSpacer(6),
            createSpacer(2),
            createKey('Numpad4', { label: '4', width: 2, classes: ['numpad'] }),
            createKey('Numpad5', { label: '5', width: 2, classes: ['numpad'] }),
            createKey('Numpad6', { label: '6', width: 2, classes: ['numpad'] })
        )
    },
    {
        cells: rowCells(
            createKey('ShiftLeft', { label: 'Shift', width: 5 }),
            [
                'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB',
                'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'
            ].map((code) => createKey(code, { width: 2 })),
            createKey('ShiftRight', { label: 'Shift', width: 7 }),
            createSpacer(2),
            createSpacer(2),
            createKey('ArrowUp', { label: '↑', width: 2, classes: ['arrow'] }),
            createSpacer(2),
            createSpacer(2),
            createKey('Numpad1', { label: '1', width: 2, classes: ['numpad'] }),
            createKey('Numpad2', { label: '2', width: 2, classes: ['numpad'] }),
            createKey('Numpad3', { label: '3', width: 2, classes: ['numpad'] }),
            createKey('NumpadEnter', { label: 'Enter', width: 2, rowSpan: 2, classes: ['numpad'] })
        )
    },
    {
        cells: rowCells(
            createKey('ControlLeft', { label: 'Ctrl', width: 3 }),
            createKey('MetaLeft', { label: 'Meta', width: 3 }),
            createKey('AltLeft', { label: 'Alt', width: 3 }),
            createKey('Space', { label: 'Space', width: 11 }),
            createKey('AltRight', { label: 'Alt', width: 3 }),
            createKey('MetaRight', { label: 'Meta', width: 3 }),
            createKey('ContextMenu', { label: 'Menu', width: 3 }),
            createKey('ControlRight', { label: 'Ctrl', width: 3 }),
            createSpacer(2),
            createKey('ArrowLeft', { label: '←', width: 2, classes: ['arrow'] }),
            createKey('ArrowDown', { label: '↓', width: 2, classes: ['arrow'] }),
            createKey('ArrowRight', { label: '→', width: 2, classes: ['arrow'] }),
            createSpacer(2),
            createKey('Numpad0', { label: '0', width: 4, classes: ['numpad'] }),
            createKey('NumpadDecimal', { label: '.', width: 2, classes: ['numpad'] })
        )
    }
];

const supplementalKeys = [
    createKey('NumpadEqual', { label: 'Num =', width: 4 }),
    createKey('IntlYen', { label: '¥', width: 4 }),
    createKey('IntlRo', { label: 'Ro', width: 4 }),
    createKey('IntlHash', { label: '#', width: 4 }),
    createKey('AudioVolumeMute', { label: 'Mute', width: 4 }),
    createKey('AudioVolumeDown', { label: 'Vol-', width: 4 }),
    createKey('AudioVolumeUp', { label: 'Vol+', width: 4 }),
    createKey('MediaTrackPrevious', { label: 'Prev', width: 4 }),
    createKey('MediaPlayPause', { label: 'Play', width: 4 }),
    createKey('MediaTrackNext', { label: 'Next', width: 4 }),
    createKey('MediaStop', { label: 'Stop', width: 4 }),
    createKey('BrightnessDown', { label: 'Dim', width: 4 }),
    createKey('BrightnessUp', { label: 'Bright', width: 4 })
];

// ============================================================================
// Layout Computation
// ============================================================================

const baseColumns = Math.max(
    ...mainKeyboardRows.map((row) => row.cells.reduce((sum, cell) => sum + cell.width, 0))
);

const supplementalRowCount = 2;

function buildSupplementalRows(totalColumns: number): KeyRow[] {
    const perRow = Math.ceil(supplementalKeys.length / supplementalRowCount);
    const rows: KeyRow[] = [];
    for (let i = 0; i < supplementalRowCount; i++) {
        const start = i * perRow;
        const slice = supplementalKeys.slice(start, start + perRow);
        const cells: Array<KeyCell | SpacerCell> = [];
        if (slice.length === 0) {
            cells.push(createSpacer(totalColumns));
        } else {
            const consumed = slice.reduce((sum, cell) => sum + cell.width, 0);
            const remaining = Math.max(0, totalColumns - consumed);
            const leading = Math.floor(remaining / 2);
            const trailing = remaining - leading;
            if (leading > 0) {
                cells.push(createSpacer(leading));
            }
            cells.push(...slice);
            if (trailing > 0) {
                cells.push(createSpacer(trailing));
            }
        }
        rows.push({ row: i + 1, cells });
    }
    return rows;
}

// ============================================================================
// Exported Layout
// ============================================================================

export const keyboardLayout: KeyRow[] = [
    ...buildSupplementalRows(baseColumns),
    ...mainKeyboardRows.map((row, idx) => ({
        row: supplementalRowCount + idx + 1,
        cells: row.cells
    }))
];

export const totalColumns = baseColumns;
export const rowCount = keyboardLayout.length;
export const KEY_HEIGHT_SCALE = 2;
export const aspectRatio = totalColumns / (rowCount * KEY_HEIGHT_SCALE);

export const knownKeyValues = new Set([
    ...keyboardLayout.flatMap((row) =>
        row.cells
            .filter((cell): cell is KeyCell => cell.kind === 'key')
            .map((cell) => cell.value)
    ),
    ...supplementalKeys.map((cell) => cell.value)
]);
