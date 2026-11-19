# Benchmark de Calibração ENEM: IA vs. Avaliação Humana

Estrutura determinística e offline para mensurar a proximidade entre o corretor de redação por inteligência artificial do Vestibular+ e notas de referência humanas na matriz de competências do ENEM.

---

## 🚀 Como Executar

O benchmark pode ser executado imediatamente via linha de comando sem nenhuma dependência externa, chaves de API ou internet:

```bash
# Execução padrão utilizando o dataset sintético de demonstração
node benchmark/runner.js

# Execução passando um dataset customizado
node benchmark/runner.js benchmark/data/dataset-demonstracao-enem.json

# Execução com exportação do relatório para Markdown
node benchmark/runner.js benchmark/data/dataset-demonstracao-enem.json --output relatorio.md
```

Para rodar a suíte de testes automatizados do benchmark:
```bash
node test/test-benchmark.js
```

---

## 📂 Estrutura de Arquivos

- [`benchmark/schema.js`](./schema.js): Validação do schema JSON, escala oficial ENEM e resolução técnica de divergências entre avaliadores (normas oficiais do INEP), distinguindo casos resolvidos de casos pendentes de banca/adjudicação.
- [`benchmark/metrics.js`](./metrics.js): Motor estatístico (MAE total e por competência, viés médio, exatidão %, faixa de ±40 pts e ranking de afastamento). Exclui estritamente casos pendentes e não resolvidos.
- [`benchmark/reporter.js`](./reporter.js): Formatador de relatórios legíveis para console e Markdown com seção detalhada de casos pendentes e esclarecimento metodológico.
- [`benchmark/runner.js`](./runner.js): CLI offline e módulo de orquestração.
- [`benchmark/data/dataset-demonstracao-enem.json`](./data/dataset-demonstracao-enem.json): Dataset sintético de demonstração técnica devidamente identificado (`eh_demonstracao: true`).
- [`benchmark/data/dataset-vazio-modelo.json`](./data/dataset-vazio-modelo.json): Modelo limpo para receber conjuntos reais autorizados.
- [`benchmark/FORMATO_DADOS.md`](./FORMATO_DADOS.md): Especificação completa do schema, metodologia de resolução do INEP e diretrizes de privacidade.
- [`test/test-benchmark.js`](../test/test-benchmark.js): Testes automatizados com asserções estritas de schema, discrepâncias e métricas.

---

## 🔒 Privacidade e Integridade

- **Nenhum dado real de estudante ou especialista foi adicionado a este repositório.**
- O arquivo `dataset-demonstracao-enem.json` contém redações e notas puramente sintéticas criadas exclusivamente para validar o pipeline técnico.
- Nenhuma migração ou alteração foi realizada no Supabase.
- A execução é 100% offline e segura.
