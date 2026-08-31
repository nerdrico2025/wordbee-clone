import type { GenerateDistributionCopyInput } from "../ai/types.js";

/**
 * Prompts da copy de distribuição (post de captação para Página do Facebook).
 *
 * A estrutura pedida ao modelo (gancho → benefício → chamada para comentar
 * uma palavra-chave → reticências que forçam o "Ver mais") vem da mecânica
 * descrita em `distribuicao-wordbee-especificacao.md` (Aulas 1 e 4), mas o
 * texto em si é sempre gerado do zero pelo modelo, com instrução explícita
 * de originalidade — em nenhum momento este projeto copia, adapta ou
 * reproduz copy, imagem ou post de terceiros (foi uma das adaptações
 * não-negociáveis do Rafael em relação ao modelo original: nada de conteúdo
 * de terceiros, tudo gerado por IA própria).
 *
 * O LINK NUNCA entra no texto gerado pelo modelo: ele é anexado
 * deterministicamente ao comentário pelo código (ver
 * `apps/worker/src/distribution-package-builder.ts`). Modelos erram URL com
 * frequência — encurtando, inventando domínio, quebrando com espaço — e um
 * link errado desperdiça a publicação inteira.
 */

const REGRAS_COMUNS = `Regras de saída (siga todas):
- Português do Brasil, tom coloquial e caloroso, como uma pessoa real falando com a comunidade dela.
- Texto 100% original: não copie, imite nem "adapte" copy, frase de efeito ou estrutura de nenhum post existente de terceiros.
- Sem hashtags, sem emojis em excesso (no máximo 2 no texto inteiro).
- Nunca escreva URL, link, endereço de site ou "www" em nenhum dos campos — o link é inserido depois, automaticamente.
- Nada de promessa falsa, sensacionalismo enganoso ou apelo a urgência inventada.
- Não use markdown nem escreva nada fora do JSON.`;

function buildDescricaoBriefing(tipoPacote: "CAPTACAO" | "DIRETO_SITE"): string {
  if (tipoPacote === "DIRETO_SITE") {
    return `"copyDescricao": legenda do post na Página. Estrutura:
1. Uma primeira linha curta que desperte curiosidade sobre o assunto.
2. Duas ou três linhas dando um gostinho do conteúdo, sem entregar tudo.
3. Uma chamada final convidando a pessoa a comentar a palavra-chave escolhida para receber o conteúdo completo.
4. Termine com reticências, para que o Facebook corte o texto e a pessoa precise tocar em "Ver mais".
Máximo de 500 caracteres.`;
  }
  return `"copyDescricao": legenda do post na Página. Estrutura:
1. Uma primeira linha curta e concreta que faça a pessoa parar de rolar o feed.
2. Duas ou três linhas de gancho sobre o assunto, despertando vontade de ver o conteúdo completo.
3. Uma chamada final pedindo que a pessoa comente a palavra-chave escolhida para receber o conteúdo.
4. Termine com reticências, para que o Facebook corte o texto e a pessoa precise tocar em "Ver mais".
Máximo de 500 caracteres.`;
}

function buildComentarioBriefing(tipoPacote: "CAPTACAO" | "DIRETO_SITE"): string {
  const destino =
    tipoPacote === "DIRETO_SITE"
      ? "onde ela encontra o conteúdo completo e outros parecidos"
      : "onde ela recebe o conteúdo completo";
  return `"copyComentario": texto do primeiro comentário do próprio autor no post, ${destino}. Estrutura:
1. Fale diretamente com quem comentou, de forma acolhedora.
2. Confirme que o conteúdo está disponível e convide a pessoa a acessar.
3. Termine numa frase que faça sentido antes de um link ser colado logo em seguida (mas NÃO escreva o link).
Máximo de 240 caracteres.`;
}

export function buildDistributionCopySystemPrompt(input: GenerateDistributionCopyInput): string {
  return [
    `Você escreve posts de divulgação para uma Página do Facebook de um blog de ${input.tipoLabel.toLowerCase()}.`,
    `O objetivo do post é gerar comentários e cliques de pessoas realmente interessadas no assunto.`,
    ``,
    `Assunto do conteúdo: ${input.titulo}`,
    ...(input.tema ? [`Tema/nicho do blog: ${input.tema}`] : []),
    ``,
    REGRAS_COMUNS,
  ].join("\n");
}

export function buildDistributionCopyUserPrompt(input: GenerateDistributionCopyInput): string {
  const quantidade = Math.max(1, input.quantidade ?? 1);

  const variacaoInstrucao =
    quantidade > 1
      ? [
          ``,
          `Gere ${quantidade} variações DIFERENTES entre si — não reescreva a mesma ideia com outras palavras. Varie o ângulo de abordagem e a palavra-chave pedida em cada uma (variar a palavra-chave ajuda o engajamento). A primeira do array será a usada por padrão, então coloque a melhor primeiro.`,
        ]
      : [];

  return [
    // Sempre um array, mesmo com uma variação só: um formato de resposta em
    // vez de dois evita o modelo "escolher" entre objeto e array e o parser
    // ter que adivinhar qual veio.
    `Escreva agora. Responda APENAS com um JSON array de ${quantidade} objeto(s), cada um com exatamente estas três chaves:`,
    ``,
    buildDescricaoBriefing(input.tipoPacote),
    ``,
    buildComentarioBriefing(input.tipoPacote),
    ``,
    `"palavraChave": uma única palavra em CAIXA ALTA que a pessoa deve comentar (ex.: QUERO, EU QUERO, ENVIA). Escolha uma que combine com o assunto e use exatamente a mesma palavra dentro de "copyDescricao".`,
    ...variacaoInstrucao,
  ].join("\n");
}
