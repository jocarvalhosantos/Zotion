# Workspace Lab

Uma aplicação web de estudo, em português, inspirada nos conceitos observados no aplicativo desktop do Notion e na documentação pública do produto. É uma implementação independente, sem código, marcas ou arquivos de conteúdo do Notion.

## O que funciona

- Páginas hierárquicas, favoritos e navegação por trilha.
- Editor de blocos com títulos, listas, tarefas, citações, destaques, código e divisores. Use `/` ou atalhos Markdown para inserir blocos; copie e cole blocos preservando o tipo dentro da mesma sessão.
- Bases de dados com vistas de tabela, quadro, lista, calendário, galeria, linha do tempo e gráfico de barras/rosca; propriedades personalizáveis de texto, número, seleção, seleção múltipla, data, checkbox, URL, e-mail, telefone, pessoa (texto simples), relação local de uma via e rollup calculado.
- Vistas nomeadas com configuração própria, filtros por propriedades e operadores com grupos AND/OR aninháveis até três níveis, várias ordenações em sequência, agrupamento e subagrupamento de linhas na tabela e movimentação de cartões.
- Busca local em títulos, conteúdo e campos da base.
- Salvamento automático no armazenamento do navegador, alternância de tema e importação/exportação de backup JSON.
- Interface responsiva para telas grandes e pequenas.

## Persistência e privacidade

Esta versão é local-first: não tem conta, servidor de dados, sincronização, colaboração ou conexão com uma conta Notion. O conteúdo criado fica no `localStorage` do navegador e só está disponível naquele navegador e perfil. Exporte um backup antes de limpar os dados do navegador. O deploy público entrega os arquivos estáticos da aplicação; não recebe nem armazena as páginas criadas.

## Desenvolvimento

Requer Node.js 24 ou compatível com Vite 8.

```bash
npm install
npm run dev
```

Para gerar os arquivos estáticos:

```bash
npm run build
```

## Coolify / Docker

O repositório inclui `Dockerfile` e configuração Nginx para servir o build como SPA. No Coolify, crie um recurso Dockerfile para este repositório, publique a porta de container `80` e associe o domínio desejado ao recurso. O container não exige variáveis de ambiente nem credenciais.

## Engenharia reversa

O método, as medidas de cobertura, os limites e as referências estão em [`docs/engenharia-reversa.md`](docs/engenharia-reversa.md). O código desta aplicação foi escrito para este projeto; o pacote do Notion, saídas brutas do REA, dados de usuário e credenciais não fazem parte deste repositório.

## Referências

- [REA — repositório oficial de Morluto](https://github.com/morluto/rea)
- [Estudo de caso REA: Notion Desktop](https://rea.tools/showcase/notion/)
- [Notion: escrever e editar páginas](https://www.notion.com/help/writing-and-editing-basics)
- [Notion: vistas, filtros e ordenação](https://www.notion.com/en-gb/help/views-filters-and-sorts)
- [Notion: propriedades de bases de dados](https://www.notion.com/help/database-properties)
- [Notion: busca](https://www.notion.com/en-gb/help/search)
