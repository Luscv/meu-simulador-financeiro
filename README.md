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

- Repositório: [Luscv/meu-simulador-financeiro](https://github.com/Luscv/meu-simulador-financeiro).
- Endereço do site: [luscv.github.io/meu-simulador-financeiro](https://luscv.github.io/meu-simulador-financeiro/).
- Fonte de publicação: **GitHub Actions**, em **Settings → Pages → Build and deployment**.

O workflow `.github/workflows/pages.yml` testa, compila e publica cada push na `main`. Também aceita execução manual em **Actions → Publicar no GitHub Pages → Run workflow**. O `base` do Vite já usa o subdiretório correto. Não é necessário configurar segredos.

## Vigências, dívidas e histórico

- **Reserva de emergência:** escolha 6, 8 ou 12 meses. A meta usa os gastos fixos ativos no mês atual + gasto diário × **30 dias fixos**. É uma meta do patrimônio e não outro desconto dos aportes.
- **Gastos fixos:** sem prazo ou com primeira cobrança e quantidade de mensalidades, incluindo a primeira. O fim é calculado e salvo. Encerrar retira cobranças a partir da competência escolhida e mantém as versões anteriores consultáveis.
- **Empréstimos:** consignado ou pessoal, parcela conhecida, primeira competência e parcelas restantes. Cada mês sai uma única vez do orçamento, fora dos descontos tributários do salário. “Total das parcelas pendentes” inclui vencidas e futuras não confirmadas, e não representa quitação antecipada.
- **Cartões:** uma fatura por cartão/competência, com valor e situação. A fatura não se repete; evite cadastrar de novo o que já está nos fixos ou variáveis.
- **Receitas extras:** mensal, semestral, anual ou **Única**. Na única, informe a competência no mesmo campo de mês do formulário: o valor líquido entra apenas nesse mês, sem reiniciar ao recarregar ou avançar o calendário. Corrigir a competência move a entrada e mantém a alteração anterior no histórico. Receitas únicas futuras também ficam visíveis para edição.
- **Projeção salarial:** o período é automático e acompanha o fim da última etapa cadastrada, inclusive acima de cinco anos; não reinicia as durações salvas. Cada card mostra o líquido CLT ou o disponível PJ após tributos e provisões. Os gráficos marcam o início de cada emprego como E1, E2…; seis etapas de um ano geram 72 meses e seis marcações anuais. No modo de salário atual, os horizontes manuais continuam disponíveis.
- **Pagamentos:** o calendário nunca marca uma obrigação como paga. Confirmar pagamento muda somente a situação, sem apagar a despesa prevista ou criar outro desembolso. Reagendar move aquela única pendência e registra o mês anterior e o novo.
- **Edições:** os campos mostram uma prévia automática. Use **Aplicar alterações**, com validade preenchida no mês atual, para confirmar salário e parâmetros. Formulários de despesas/dívidas confirmam em **Salvar**. O **Histórico de alterações** guarda identificador, registro em data/hora, competência de validade, ação, item e valores anteriores/novos. Não há registro por tecla digitada.
- **Versões:** editar a partir de março preserva janeiro/fevereiro. Correções retroativas e encerramentos mantêm o histórico. Saldo inicial + aportes + extras/benefícios + rendimentos − retiradas + revisões de saldo informado = saldo final. Revisar um saldo para uma competência futura redefine a referência naquela data; não cria um aporte. Todas as tabelas são projeções recalculáveis, não movimentações realizadas.

As datas de compromissos e do início das etapas salariais ficam salvas: recarregar ou avançar o calendário não reinicia a contagem. A versão antiga é migrada automaticamente para o formato 2, preservando sua cópia no armazenamento e criando um único registro de estado inicial importado. Como o formato anterior não guardava uma data absoluta de início, a referência conhecida é o mês da migração; não inventamos alterações passadas.

## Exportar e importar JSON

1. Confirme ou descarte prévias pendentes. Clique em **Exportar dados** para baixar um `.json` com versão, data de exportação, configurações, versões financeiras, compromissos, pagamentos, reagendamentos e histórico.
2. No outro navegador/dispositivo, clique em **Importar dados** e escolha esse arquivo.
3. Confira o resumo e confirme **Substituir dados**. A importação substitui integralmente os dados locais, sem mesclar, e acrescenta um registro de importação ao histórico recebido.

Arquivos com formato, versão, estrutura ou tipos inválidos são recusados antes de modificar o estado. Cancelar a confirmação também preserva os dados existentes. Só há transferência manual por JSON; não existe sincronização externa. O histórico é local e consultável, sem garantia de inviolabilidade.

## Premissas principais

- Referência das regras: **13/11/2026**. Fontes oficiais consultadas durante o desenvolvimento em [SOURCES.md](SOURCES.md). Anos futuros mantêm essas regras, sem reajustes presumidos.
- CLT: INSS progressivo; IRRF com a dedução mais favorável e redução de 2026. Sem dependentes, pensão ou outros descontos. FGTS é patrimônio separado, sem reduzir o salário líquido.
- PJ: serviços de TI sujeitos ao fator R, Simples Nacional, Anexo III; pró-labore interno de 28% do faturamento, mínimo de R$ 1.621, com INSS e IRRF. Receita anualizada = mês × 12. CPP incluída no DAS. Lucros com escrituração e retenção de dividendos quando aplicável. Limite deste cenário: R$ 300 mil/mês. Sem ajuste anual de IR ou custos opcionais.
- Provisões PJ: faturamento ÷ 12 para 13º e ÷ 36 para adicional de férias. São separadas dos tributos e não provisionam outro salário inteiro de férias.
- Meses completos a partir do mês atual. No modo de projeção salarial, o período exibido termina junto da última etapa; os totais dos próximos 12 meses mantêm a última renda se as etapas terminarem antes. Gastos nominais constantes, com dias reais para gastos variáveis; totais anuais somam os próximos 12 meses.
- Investimento: taxa líquida anual assumida (10% inicialmente, editável), convertida para taxa mensal equivalente. Aportes no final do mês. Extras mensais em todos os meses; semestrais a cada 6 meses; anuais a cada 12 meses desde o início; únicos somente na competência absoluta informada. Extras entram uma vez no saldo, separados do salário disponível e dos aportes regulares.
- Benefícios CLT e provisões PJ selecionados acumulam fora do saldo investido e entram no fim de cada ciclo de 12 meses. Não há dupla tributação ou dupla contagem de férias. Provisões PJ desativadas ficam para uso pessoal. Déficits reduzem a reserva; saldo nunca fica negativo rendendo juros. A parte não coberta aparece explicitamente.
- FGTS: saldo inicial + depósitos CLT, sem remuneração futura. Convenção mensal de 8% sobre salário, 1/12 do 13º e 1/36 do salário para o adicional de férias; nenhuma duplicação do salário de férias. PJ preserva o saldo anterior sem gerar depósitos.
- Imóvel usado em BH/Contagem, SAC, 420 meses, cotista, renda individual, sem subsídio de entrada. Salário imobiliário manual e independente, com referência líquida CLT. Somente o FGTS projetado alimenta a entrada; a reserva financeira não é consumida.
- MCMV: taxas e limites de 2026. Para baixa renda, teto local comum conservador de Contagem (R$ 255 mil; BH: R$ 270 mil). Acima dele, opção sem subsídio até R$ 400 mil, a 7,66% nominais a.a., nos termos do art. 20, § 5º, da Resolução 702. Renda até R$ 9.600: imóvel até R$ 400 mil; até R$ 13 mil: até R$ 600 mil. Cotas de 80% nas faixas 1–3 e 60% no usado da Classe Média no Sudeste.
- Padrão: referência SBPE a partir de 10,99% efetivos a.a., cota SAC de 80%, limitado ao SFH (R$ 2,25 milhões). TR = zero em ambas as modalidades. Sem ITBI, seguros, tarifas ou despesas adicionais. Não representa proposta ou aprovação de crédito.

Cada seção tem um bloco expansível **Como calculamos**. As regras tributárias ficam em `src/engine/rules.ts`; `calculate.ts` contém o motor mensal, `timeline.ts` resolve versões/obrigações por competência, `data.ts` valida e migra os dados e `state.ts` coordena prévias, confirmação e persistência.

## Validação

Testes automatizados cobrem as regras financeiras existentes, reserva de emergência, prazos de uma ou várias parcelas na virada do ano, pagamento sem dupla contagem, reagendamento, vigências futuras e retroativas, manutenção de versões, migração, persistência, confirmação de edição e importação/exportação sem perda de dados.

A interface tem grades responsivas, navegação móvel, gráficos SVG sem bibliotecas externas, tabelas com rolagem, rótulos acessíveis, navegação por teclado e diálogos nativos. A revisão visual em navegador real não foi executada neste ambiente: a ferramenta `cua_repl.js` não estava disponível. A interação foi validada em DOM simulado (jsdom).
