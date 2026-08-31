import { randomBytes } from "node:crypto";

/**
 * Utilitários puros da distribuição, compartilhados entre web e worker.
 * Nada aqui toca banco, rede ou credencial — é só cálculo de string, o que
 * permite testar todas as regras de formato sem mock nenhum.
 */

// Sem "0/O/1/l/I": os códigos aparecem em link colado à mão e ditado por
// WhatsApp entre o Rafael e os familiares. Confundir 0 com O manda a pessoa
// para um link que não existe.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Código curto de um link rastreado (`/r/{code}`).
 *
 * `randomBytes` (não `Math.random`) e rejeição do resto da divisão para não
 * enviesar as últimas letras do alfabeto: com 56 símbolos e 8 posições são
 * ~9,6 × 10^13 combinações, então colisão é desprezível — e mesmo assim a
 * unique de `distribution_links.code` é quem garante de verdade (quem grava
 * tenta de novo se colidir).
 */
export function generateShortCode(length = 8): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let code = "";
  while (code.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= max) continue; // descarta para manter a distribuição uniforme
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

/**
 * URL de busca do blog para um tema — destino dos pacotes DIRETO_SITE
 * (conceito da Aula 4: a página de busca mostra vários artigos do tema e
 * mais anúncios do que o artigo isolado, e só faz sentido quando o blog já
 * tem conteúdo suficiente sobre aquele tema).
 *
 * `/?s=` é o formato nativo de busca do WordPress, válido em qualquer
 * instalação, com ou sem permalinks amigáveis.
 */
export function buildSearchUrl(siteUrl: string, tema: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/?s=${encodeURIComponent(tema.trim())}`;
}

/** URL pública de um link rastreado. */
export function buildTrackedUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/r/${code}`;
}

/**
 * Troca o link que está no fim da copy de comentário pelo link rastreado
 * daquela combinação perfil × grupo.
 *
 * O pacote guarda a copy já com o link de destino anexado (é o que a
 * publicação automática em Página usa). Cada item da fila manual precisa do
 * MESMO texto, mas com o link curto daquela combinação — é o que permite
 * saber de qual grupo/perfil veio cada clique. Substituição literal, não
 * regex de URL: o texto foi montado pelo próprio código anexando
 * exatamente `destinoAtual`, então não há ambiguidade sobre o que trocar.
 */
export function trocarLinkDaCopy(copyComentario: string, destinoAtual: string | null, novoLink: string): string {
  if (!destinoAtual) return `${copyComentario}\n\n${novoLink}`;
  if (!copyComentario.includes(destinoAtual)) return `${copyComentario}\n\n${novoLink}`;
  return copyComentario.split(destinoAtual).join(novoLink);
}

/**
 * Prompt de uma das imagens de um álbum de captação.
 *
 * O modelo original ensinado nas aulas monta o álbum com fotos virais de
 * terceiros achadas no Pinterest/Google. Aqui cada foto é gerada do zero
 * pelo provedor de imagem já configurado — o `angulo` varia o
 * enquadramento para que as N imagens não saiam praticamente iguais, que é
 * o que acontece quando se manda o mesmo prompt N vezes.
 */
const ANGULOS_ALBUM = [
  "foto principal do prato/assunto pronto, vista de cima, mesa bem posta",
  "close aproximado mostrando textura e detalhe, pouca profundidade de campo",
  "cena de preparo, com ingredientes ou elementos ao redor",
  "porção individual servida, luz natural lateral",
  "vista em ângulo de 45 graus, fundo desfocado e aconchegante",
  "composição com dois elementos lado a lado, luz suave",
];

export function buildAlbumImagePrompt(titulo: string, tema: string, index: number): string {
  const angulo = ANGULOS_ALBUM[index % ANGULOS_ALBUM.length];
  return `Fotografia realista e apetitosa para um post de rede social sobre "${titulo}" (tema: ${tema}). Enquadramento: ${angulo}. Alta qualidade, iluminação natural, cores vivas, sem nenhum texto, letra, marca d'água ou logotipo sobreposto na imagem.`;
}

/** Quantas imagens um pacote pode ter, no máximo (formato álbum). */
export const MAX_IMAGENS_PACOTE = 6;
