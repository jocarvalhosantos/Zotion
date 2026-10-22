# Workspace Lab

Uma aplicação web de estudo, em português, inspirada nos conceitos observados no aplicativo desktop do Notion e na documentação pública do produto. É uma implementação independente, sem código, marcas ou arquivos de conteúdo do Notion.

## O que funciona

- Múltiplos workspaces locais, com criação, alternância, nome, ícone, descrição, aparência própria e arquivamento reversível. O formato anterior é migrado preservando identificadores e conteúdo.
- Áreas de organização dentro de cada workspace, com nome, ícone, descrição e arquivamento/restauração. Áreas não representam permissões de acesso.
- Página inicial com acesso recente, áreas e modelos. Páginas hierárquicas, favoritos, navegação por trilha, movimentação e duplicação de árvores. Transferências entre workspaces levam versões e preservam os IDs associados ao áudio; vínculos externos à árvore precisam ser resolvidos antes de transferir.
- Lixeira com busca, consulta, restauração da árvore e exclusão definitiva confirmada. Arquivamento de páginas separado da lixeira.
- Galeria com sete modelos próprios e modelos personalizados salvos a partir de páginas, incluindo bases de dados.
- Capas em degradê, três fontes, largura total, texto pequeno, sumário e bloqueio contra edição acidental por página.
- Comentários locais com respostas, edição, resolução e reabertura. Histórico local com até 20 snapshots por página, prévia e restauração que preserva uma versão do estado substituído.
- Editor de blocos com títulos, listas, tarefas, citações, destaques, código e divisores. Use `/` ou atalhos Markdown para inserir blocos; selecione vários com `Shift` + clique ou setas e copie, recorte, duplique, agrupe, desagrupe, exclua ou reordene a seleção. A cópia estruturada preserva tipos e grupos na sessão atual.
- Atalho “Nova reunião” e bloco `/meet` para pauta, participantes, gravação local pelo microfone, reprodução e download do áudio, transcrição editável, resumo, decisões e itens de ação com responsáveis. O rascunho do resumo é heurístico e roda no navegador; não há transcrição automática nem envio de áudio para IA externa.
- Bases de dados com vistas de tabela, quadro, lista, calendário, galeria, linha do tempo, gráficos de barras/rosca e formulários locais. Formulários permitem configurar perguntas visíveis e obrigatórias, descrições e confirmação de envio; as respostas criam linhas na base atual.
- Propriedades personalizáveis de texto, número, seleção, seleção múltipla, data, checkbox, URL, e-mail, telefone, pessoa (texto simples), relação local de uma via, rollup calculado e fórmulas com operadores e funções comuns de texto, matemática e datas.
- Vistas nomeadas com configuração própria, filtros por propriedades e operadores com grupos AND/OR aninháveis até três níveis, várias ordenações em sequência, agrupamento e subagrupamento de linhas na tabela e movimentação de cartões.
- Blocos recolhíveis, imagens locais PNG/JPEG/WebP/GIF de até 512 KiB, cartões de links, links para páginas e referências de retorno; cores de texto e fundo por bloco. Cartões não buscam metadados externos e blocos recolhíveis contêm texto simples.
- Busca local em títulos, conteúdo e campos da base, isolada por workspace, com inclusão opcional de páginas arquivadas.
- Salvamento automático no armazenamento do navegador, importação/exportação JSON do workspace ou catálogo completo, importação de Markdown/texto e exportação de páginas em Markdown. Importar JSON adiciona espaços novos sem substituir os anteriores.
- Interface responsiva para telas grandes e pequenas.

## Persistência e privacidade

Esta versão é local-first: não tem conta, servidor de dados, sincronização, colaboração ou conexão com uma conta Notion. Workspaces, páginas, imagens, comentários e notas de reunião ficam no `localStorage` do navegador; áudios e versões de páginas ficam no `IndexedDB` da mesma origem e perfil. O nome do perfil identifica comentários locais; não é autenticação. Áreas e bloqueios organizam o conteúdo e previnem edições acidentais; não restringem o acesso de outras pessoas que usam o mesmo perfil de navegador.

A gravação só começa após a confirmação de autorização dos participantes e a permissão do microfone. O navegador grava apenas o microfone. O formulário não coleta respostas de outras pessoas em um servidor nem gera um link público. O backup JSON inclui conteúdo, imagens e comentários, mas não inclui versões históricas ou arquivos de áudio; os áudios podem ser baixados um por um no bloco da reunião. A duplicação e os modelos não copiam áudio, comentários nem versões. Links de página abrem conteúdo já presente no mesmo navegador e perfil; não publicam a página. O deploy público entrega os arquivos estáticos da aplicação; não recebe nem armazena páginas ou gravações.

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

O método, as medidas de cobertura, os limites e as referências estão em [`docs/engenharia-reversa.md`](docs/engenharia-reversa.md). A investigação de workspaces e a distinção entre evidência REA e comportamento documentado estão em [`docs/workspace-investigation.md`](docs/workspace-investigation.md). O código desta aplicação foi escrito para este projeto; o pacote do Notion, saídas brutas do REA, dados de usuário e credenciais não fazem parte deste repositório.

## Referências

- [REA — repositório oficial de Morluto](https://github.com/morluto/rea)
- [Estudo de caso REA: Notion Desktop](https://rea.tools/showcase/notion/)
- [Notion: escrever e editar páginas](https://www.notion.com/help/writing-and-editing-basics)
- [Notion: vistas, filtros e ordenação](https://www.notion.com/en-gb/help/views-filters-and-sorts)
- [Notion: formulários](https://www.notion.com/help/forms)
- [Notion: propriedades de bases de dados](https://www.notion.com/help/database-properties)
- [Notion: busca](https://www.notion.com/en-gb/help/search)
- [Notion: AI Meeting Notes](https://www.notion.com/help/ai-meeting-notes)
