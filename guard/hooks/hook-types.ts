import type { EventName, Hook } from 'claude-code'

// O validador só segue o `$` para dentro de declarações de função (function f($, e, next)); estes
// aliases dão-lhes os tipos do evento, que um `Hook<'x'>` const não deixaria declarar.
export type HookInput<N extends EventName> = Parameters<Hook<N>>[1]
export type HookNext<N extends EventName> = (e: HookInput<N>) => HookResult<N>
export type HookResult<N extends EventName> = Promise<Awaited<ReturnType<Hook<N>>>>
