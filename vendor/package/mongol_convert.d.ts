/* tslint:disable */
/* eslint-disable */

/**
 * A finished conversion: `text` is what `translate` returns, `warnings` says what the conversion
 * had to do beyond what the input said (empty for most conversions). Today only the `utn57`
 * target raises any, for a hub run it could spell only with an invented ZWJ. `repairs` lists
 * the suffix separators that `translate_with_options` restored, one entry per edit; it is empty
 * unless repair was requested.
 */
export class Translation {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    repairs: string[];
    text: string;
    warnings: string[];
}

/**
 * Restore legacy SoftBank/iOS emoji that collide with MenkShape PUA.
 */
export function restore_menk_shape_emoji(input: string): string;

/**
 * Translate `input` from encoding `from` to `to`. `from`/`to` are canonical encoding names
 * ("zvvnmod", "delehi", "menk_shape", "menk_letter", "z52", "utn57").
 * Throws a JS `Error` on an unknown encoding name or an unsupported conversion.
 */
export function translate(from: string, to: string, input: string): string;

/**
 * Like `translate_with_options`, with all currently supported input-normalization switches.
 */
export function translate_with_all_options(from: string, to: string, input: string, repair_suffix_separators: boolean, restore_menk_shape_emoji: boolean): Translation;

/**
 * Like `translate_with_warnings`, with `repair_suffix_separators` set, also restores NNBSP before
 * known suffixes in `menk_letter` / `delehi` input first (a space that lost its NNBSP would
 * otherwise shape as an independent word). Throws if repair is requested for any other source.
 */
export function translate_with_options(from: string, to: string, input: string, repair_suffix_separators: boolean): Translation;

/**
 * Like `translate`, and also reports the conversion's warnings. Throws on the same errors.
 */
export function translate_with_warnings(from: string, to: string, input: string): Translation;

/**
 * Library version.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_translation_repairs: (a: number) => [number, number];
    readonly __wbg_get_translation_text: (a: number) => [number, number];
    readonly __wbg_get_translation_warnings: (a: number) => [number, number];
    readonly __wbg_set_translation_repairs: (a: number, b: number, c: number) => void;
    readonly __wbg_set_translation_text: (a: number, b: number, c: number) => void;
    readonly __wbg_set_translation_warnings: (a: number, b: number, c: number) => void;
    readonly __wbg_translation_free: (a: number, b: number) => void;
    readonly restore_menk_shape_emoji: (a: number, b: number) => [number, number];
    readonly translate: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly translate_with_all_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly translate_with_options: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly translate_with_warnings: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly version: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
