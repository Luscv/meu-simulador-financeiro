# Meu Simulador Financeiro

Dashboard pessoal estático em React, TypeScript e Vite. Salário CLT/PJ, orçamento, investimentos, FGTS e compra de imóvel usam um único motor mensal. Não há backend, login, telemetria ou chamadas externas. A última simulação é salva automaticamente no `localStorage` deste navegador.

## Executar

Requer Node.js 22 ou superior.

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173/meu-simulador-financeiro/`.

```sh
npm test       # cálculos, limites, interação e persistência
npm run build # verificação TypeScript e build em dist/
npm run preview
```

## GitHub Pages

1. Envie o conteúdo deste projeto para um repositório chamado `meu-simulador-financeiro`, na branch `main`.
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
3. O workflow `.github/workflows/pages.yml` testa, compila e publica cada push na `main`. Também aceita execução manual.

Endereço esperado: `https://<usuario>.github.io/meu-simulador-financeiro/`. O `base` do Vite já usa esse subdiretório. Não é necessário configurar segredos. A publicação efetiva depende de um repositório GitHub; este ambiente começou sem checkout ou remote.

## Premissas principais

- Referência das regras: **13/11/2026**. Fontes oficiais consultadas durante o desenvolvimento em [SOURCES.md](SOURCES.md). Anos futuros mantêm essas regras, sem reajustes presumidos.
- CLT: INSS progressivo; IRRF com a dedução mais favorável e redução de 2026. Sem dependentes, pensão ou outros descontos. FGTS é patrimônio separado, sem reduzir o salário líquido.
- PJ: serviços de TI sujeitos ao fator R, Simples Nacional, Anexo III; pró-labore interno de 28% do faturamento, mínimo de R$ 1.621, com INSS e IRRF. Receita anualizada = mês × 12. CPP incluída no DAS. Lucros com escrituração e retenção de dividendos quando aplicável. Limite deste cenário: R$ 300 mil/mês. Sem ajuste anual de IR ou custos opcionais.
- Provisões PJ: faturamento ÷ 12 para 13º e ÷ 36 para adicional de férias. São separadas dos tributos e não provisionam outro salário inteiro de férias.
- Meses completos a partir do mês atual. Última etapa salarial continua após a duração cadastrada. Gastos nominais constantes, com dias reais para gastos variáveis; totais anuais somam os próximos 12 meses.
- Investimento: taxa líquida anual assumida (10% inicialmente, editável), convertida para taxa mensal equivalente. Aportes no final do mês. Extras mensais em todos os meses; semestrais a cada 6 meses; anuais a cada 12 meses desde o início.
- Benefícios CLT e provisões PJ selecionados acumulam fora do saldo investido e entram no fim de cada ciclo de 12 meses. Não há dupla tributação ou dupla contagem de férias. Provisões PJ desativadas ficam para uso pessoal. Déficits reduzem a reserva; saldo nunca fica negativo rendendo juros. A parte não coberta aparece explicitamente.
- FGTS: saldo inicial + depósitos CLT, sem remuneração futura. Convenção mensal de 8% sobre salário, 1/12 do 13º e 1/36 do salário para o adicional de férias; nenhuma duplicação do salário de férias. PJ preserva o saldo anterior sem gerar depósitos.
- Imóvel usado em BH/Contagem, SAC, 420 meses, cotista, renda individual, sem subsídio de entrada. Salário imobiliário manual e independente, com referência líquida CLT. Somente o FGTS projetado alimenta a entrada; a reserva financeira não é consumida.
- MCMV: taxas e limites de 2026. Para baixa renda, teto local comum conservador de Contagem (R$ 255 mil; BH: R$ 270 mil). Acima dele, opção sem subsídio até R$ 400 mil, a 7,66% nominais a.a., nos termos do art. 20, § 5º, da Resolução 702. Renda até R$ 9.600: imóvel até R$ 400 mil; até R$ 13 mil: até R$ 600 mil. Cotas de 80% nas faixas 1–3 e 60% no usado da Classe Média no Sudeste.
- Padrão: referência SBPE a partir de 10,99% efetivos a.a., cota SAC de 80%, limitado ao SFH (R$ 2,25 milhões). TR = zero em ambas as modalidades. Sem ITBI, seguros, tarifas ou despesas adicionais. Não representa proposta ou aprovação de crédito.

Cada seção tem um bloco expansível **Como calculamos**. Os parâmetros ficam em `src/engine/rules.ts`, os cálculos em `src/engine/calculate.ts` e o estado validado em `src/state.ts`.

## Validação

Testes automatizados cobrem faixas de INSS/IRRF, transição de salário/regime, dias reais e ano bissexto, totais anuais variáveis, juros e aportes, déficits, provisões, incidências de FGTS, SAC, limites do MCMV, independência da renda imobiliária, edição de listas e restauração do `localStorage`.

A interface tem grades responsivas, navegação móvel, gráficos SVG sem bibliotecas externas, tabelas com rolagem, rótulos acessíveis, navegação por teclado e diálogos nativos. A revisão visual em navegador real não foi executada neste ambiente: a ferramenta `cua_repl.js` não estava disponível. A interação foi validada em DOM simulado (jsdom).
