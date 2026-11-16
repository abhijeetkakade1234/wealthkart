import type { en } from "./en";

/** The English dictionary's exact type (literal strings), the source of truth. */
export type En = typeof en;

/**
 * The shape every other language must fill: same nesting and keys, any string. A missing or
 * extra key in `hi` or `mr` fails typecheck.
 */
export type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Dict = Shape<En>;

/** Every dotted key, e.g. "nav.home" or "msg.userRejected". */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type Key = Leaves<En>;

type At<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? At<T[H], R>
    : never
  : K extends keyof T
    ? T[K]
    : never;

/** `{name}` placeholders in a string, as a union of names. */
export type ParamNames<S> = S extends `${string}{${infer P}}${infer R}` ? P | ParamNames<R> : never;

export type ParamsOf<K extends Key> = ParamNames<At<En, K>>;
export type ParamValues<K extends Key> = Record<ParamsOf<K>, string | number>;

/** Arguments after the key: none when the string has no params, else every param. */
export type TArgs<K extends Key> = [ParamsOf<K>] extends [never] ? [] : [params: ParamValues<K>];

/** Keys that come in `_one` / `_other` pairs, by their base: "time.hoursAgo" for "time.hoursAgo_one". */
export type PluralKey = {
  [K in Key]: K extends `${infer B}_other` ? (`${B}_one` extends Key ? B : never) : never;
}[Key];
export type PluralParams<B extends PluralKey> = Omit<
  Record<ParamsOf<`${B}_other` & Key>, string | number>,
  "count"
>;

/** Keys with no params: safe to keep in a constant and pass to `t(key)` later. */
export type PlainKey = { [K in Key]: [ParamsOf<K>] extends [never] ? K : never }[Key];
