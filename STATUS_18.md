# STATUS_18 — Vestibular+ (Pedro)

> Repositório: `pedromartins16k-alt/vestibular-plus` (público no GitHub)
> Deploy: `vestibular-plus.vercel.app` (Vercel)
> Supabase project ID: `jruyyzftoplcobketrsf` (região `sa-east-1`)
> Data: 19/08/2026

## 📌 O que foi feito nesta sessão

1. **Substituição do Card de Sequência de Dias por Cotas Disponíveis no Dashboard**:
   - Como a ofensiva de dias seguidos (Streak) já está em destaque na barra superior (`topbar-streak`), o 4º retângulo lateral de estatísticas foi substituído por um mini-painel com o saldo restante de cada função no dia:
     - ✅ **Questões restantes** (ex: 15/dia)
     - 📚 **Resumos restantes** (ex: 10/dia)
     - 🤖 **Perguntas com IA restantes** (ex: 10/dia)
     - ⏱️ **Simulados restantes** (ex: 5/semana)
   - Contadores integrados com a tabela `uso_recursos` em tempo real.
   - Planos PRO/Premium/Ultimate exibem símbolo de infinito (`∞`).