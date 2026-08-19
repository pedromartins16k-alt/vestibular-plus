# STATUS_17 — Vestibular+ (Pedro)

> Repositório: `pedromartins16k-alt/vestibular-plus` (público no GitHub)
> Deploy: `vestibular-plus.vercel.app` (Vercel)
> Supabase project ID: `jruyyzftoplcobketrsf` (região `sa-east-1`)
> Data: 19/08/2026

## 📌 O que foi feito nesta sessão

1. **Correção do Contador de Limite Diário (Questões/Temas)**:
   - **Causa raiz identificada**: ao navegar pelos temas e carregar questões, o script `questoes.js` disparava o registro de consumo antes mesmo do aluno responder à questão.
   - **Solução implementada**: criada a função `consultar_uso_diario` (apenas leitura, sem incrementar ao navegar) e `verificar_e_registrar_uso` que só incrementa quando o aluno clica na alternativa para enviar a resposta (`selecionarResposta`).
   - Aumentados os limites do plano Free no banco (`public.planos`):
     - **15 questões diárias** (era 5)
     - **10 resumos diários** (era 3)
     - **5 simulados por semana** (era 1)

2. **Fuso Horário e Reset Diário à Meia-noite (Brasília)**:
   - As funções SQL foram atualizadas para utilizar `(now() AT TIME ZONE 'America/Sao_Paulo')::date` em vez de UTC (`CURRENT_DATE`), garantindo que o reset diário ocorra exatamente à meia-noite do horário de Brasília.

3. **Correção da Sequência de Dias (Streak no Dashboard)**:
   - Ajustada a função `calcularSequencia` em `dashboard.js` para formatar as datas no fuso horário local do navegador (`YYYY-MM-DD` local), impedindo que o streak seja zerado ou perca a contagem após as 21h.

4. **Script SQL Criado e Aplicado**:
   - Arquivo `database/schema_patch_limites.sql` criado e executado com sucesso no Supabase.