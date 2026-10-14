import type { PrumoGuardPending } from '../types'

// O validador só lê átomos cuja referência (plugin e chave literais) está declarada no próprio
// ficheiro que os usa; por isso cada módulo declara o seu `atom({ plugin: 'prumo-guard', key })` e
// o que se partilha aqui são os valores por omissão, para as declarações não divergirem.
export const PENDING_DEFAULT: PrumoGuardPending[] = []
