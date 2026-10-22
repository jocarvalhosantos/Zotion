# Workspace Lab

Uma aplicação web de estudo, em português, inspirada nos conceitos observados no aplicativo desktop do Notion e na documentação pública do produto. É uma implementação independente, sem código, marcas ou arquivos de conteúdo do Notion.

## O que funciona

- Páginas hierárquicas, favoritos e navegação por trilha.
- Editor de blocos com títulos, listas, tarefas, citações, destaques, código e divisores. Use `/` ou atalhos Markdown para inserir blocos; selecione vários com `Shift` + clique ou setas e copie, recorte, duplique, agrupe, desagrupe, exclua ou reordene a seleção. A cópia estruturada preserva tipos e grupos na sessão atual.
- Atalho “Nova reunião” e bloco `/meet` para pauta, participantes, gravação local pelo microfone, reprodução e download do áudio, transcrição editável, resumo, decisões e itens de ação com responsáveis. O rascunho do resumo é heurístico e roda no navegador; não há transcrição automática nem envio de áudio para IA externa.
- Bases de dados com vistas de tabela, quadro, lista, calendário, galeria, linha do tempo, gráficos de barras/rosca e formulários locais. Formulários permitem configurar perguntas visíveis e obrigatórias, descrições e confirmação de envio; as respostas criam linhas na base atual.
- Propriedades personalizáveis de texto, número, seleção, seleção múltipla, data, checkbox, URL, e-mail, telefone, pessoa (texto simples), relação local de uma via, rollup calculado e fórmulas com operadores e funções comuns de texto, matemática e datas.
- Vistas nomeadas com configuração própria, filtros por propriedades e operadores com grupos AND/OR aninháveis até três níveis, várias ordenações em sequência, agrupamento e subagrupamento de linhas na tabela e movimentação de cartões.
- Busca local em títulos, conteúdo e campos da base.
- Salvamento automático no armazenamento do navegador, alternância de tema e importação/exportação de backup JSON.
- Interface responsiva para telas grandes e pequenas.

## Persistência e privacidade

Esta versão é local-first: não tem conta, servidor de dados, sincronização, colaboração ou conexão com uma conta Notion. Páginas, pautas, transcrições, resumos e ações ficam no `localStorage` do navegador; áudios de reunião ficam no `IndexedDB` da mesma origem e perfil. A gravação só começa após a confirmação de autorização dos participantes e a permissão do microfone. O navegador grava apenas o microfone. O formulário não coleta respostas de outras pessoas em um servidor nem gera um link público. Exporte um backup antes de limpar os dados do navegador; o backup JSON não inclui os arquivos de áudio, que podem ser baixados um por um no bloco da reunião. O deploy público entrega os arquivos estáticos da aplicação; não recebe nem armazena páginas ou gravações.

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
- [Notion: formulários](https://www.notion.com/help/forms)
- [Notion: propriedades de bases de dados](https://www.notion.com/help/database-properties)
- [Notion: busca](https://www.notion.com/en-gb/help/search)
- [Notion: AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes)
