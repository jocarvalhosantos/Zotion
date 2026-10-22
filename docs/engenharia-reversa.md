# Engenharia reversa: método, evidências e limites

## Objetivo e escopo

Este estudo usa o REA (Reverse Engineer Anything), mantido por Morluto, para observar o pacote Electron instalado do Notion Desktop. O alvo foi o `app.asar` empacotado com o aplicativo; não foram extraídos dados da conta, páginas do usuário, tokens ou credenciais. A interface web do Notion redirecionou para autenticação durante a inspeção e não foi automatizada. Assim, as conclusões sobre o cliente online são limitadas à documentação pública do Notion e ao estudo público do REA.

O resultado é um mapa estático parcial e uma aplicação independente que reproduz um conjunto pequeno de padrões de interação. Não é uma implementação da API do Notion nem uma cópia integral do produto.

## Ferramenta e artefato

- Projeto: [morluto/rea](https://github.com/morluto/rea), CLI `rea-agents` 6.7.0.
- Operações: `inspect_artifact` e `analyze_javascript_application`.
- Formato: ASAR, aplicativo Electron.
- Manifesto `/package.json` do mesmo ASAR: Notion Desktop `7.40.0`; versão declarada de `electron`: `44.9.1`.
- SHA-256 da raiz do artefato: `afb4684fa08d12d7ccd3c89e2ad195de7047859d437e721689a5cbfc69403549`.
- Política de integridade: `record-and-continue`, pois o inventário encontrou cinco contradições entre metadados de integridade e bytes observados em módulos nativos desempacotados. Esses bytes foram marcados como não confiáveis e não sustentam conclusões de equivalência.

Os arquivos `.asar` e os relatórios brutos são evidência local de trabalho e não são publicados junto com o código.

## O que o REA observou

Na análise do pacote desktop, o REA reportou:

- 268 nós, 284 ocorrências e 283 arestas no inventário do artefato;
- 161 arquivos relevantes, 90 arquivos JavaScript analisados, 8 ignorados, 2.789 módulos e 1.749.894 nós AST visitados;
- 8.520 achados e zero falhas de parse nos arquivos que o analisador conseguiu processar;
- 14 definições de janelas de navegador e 41 preferências explícitas para conteúdo web;
- 20 APIs de `contextBridge` com 282 membros expostos;
- 26 operações IPC observadas, entre elas 7 canais literais, 13 operações com canal dinâmico, 10 handlers no processo principal e 5 pares de envio/recepção reconhecidos;
- 2 processos utilitários observados.

Essas contagens descrevem achados da análise estática do artefato e não significam que cada fluxo foi executado ou compreendido por completo. O grafo semântico ficou marcado como parcial e truncado, com 164 limitações registradas. O orçamento de análise e a memória disponível impediram a análise semântica completa de alguns bundles grandes. O relatório completo foi mantido fora do repositório porque contém evidência extensa derivada do aplicativo instalado.

## Achado focado: área de transferência

Uma leitura focada do Evidence `ev_33033f169f7b21d9c6d067ba341f8c2ec59c53049f2ef0634171c19767d58122` encontrou, no arquivo `.webpack/renderer/tab_browser_view/preload.js`, dois caminhos estáticos candidatos:

- `__electronApi.copyImage` termina em `navigator.clipboard.write`; o caminho contém condições estáticas, mas a análise não prova que ele foi executado.
- `__electronApi.copyText` termina em `navigator.clipboard.writeText`.

Confirmei o resultado com uma segunda execução REA, Evidence `ev_df7197a36039e07bb30b08af956484cb53304ba6a5ca597a03fcab66dc6fa894`, selecionando somente esse preload. O REA leu 401.659 bytes, visitou 93.657 nós AST, analisou 126 módulos e registrou 270 achados, 5 APIs `contextBridge` e 232 membros expostos. A seleção deixou 160 arquivos sem análise. Portanto, a ausência de handlers de processo principal neste resultado focado é desconhecida, não evidência de ausência no aplicativo. Os dois caminhos de clipboard continuaram marcados como candidatos.

O REA marcou ambos como `candidate`. Isso confirma as expressões observadas no pacote, mas não identifica o chamador em tempo de execução nem o payload completo, o formato rico, as permissões efetivas ou o fluxo de colagem. O achado não autoriza concluir que o Notion instalado use o mesmo protocolo do estudo público.

O [estudo de caso público do REA sobre a área de transferência do Notion](https://rea.tools/showcase/notion/) descreve uma trilha analisada em Notion Desktop `7.6.1`: texto e HTML no clipboard, um identificador no HTML e dados estruturados mantidos localmente para restaurar blocos quando esse identificador ainda existe. O artefato instalado aqui é `7.40.0`, portanto essa trilha anterior serve como referência conceitual e não prova o comportamento exato desta versão. Os dois fluxos não foram tratados como equivalentes.

### Escolha de reconstrução nesta aplicação

A aplicação implementa seu próprio formato: copia o texto simples e uma representação HTML com um marcador `workspace-lab:<id>`, mantendo o bloco estruturado em memória na sessão atual. Ao colar a partir desse marcador na mesma sessão, restaura o tipo e o conteúdo do bloco; se a cópia vier de outro aplicativo, de outra sessão ou não tiver HTML, o navegador usa texto simples. O marcador e o formato não reutilizam IDs nem MIME types do Notion. Esta é uma decisão de implementação inspirada na evidência e não uma alegação de paridade.

## Modelo de produto adotado

O pacote desktop é uma camada Electron com janelas e comunicação entre processos. Isso, por si só, não descreve os serviços web, a persistência remota ou os protocolos internos do Notion. Para as partes visíveis ao usuário, o estudo foi combinado com a documentação oficial:

- As páginas são compostas por blocos e a interface documenta a inserção de blocos por comandos `/`.
- Bases de dados têm propriedades tipadas e várias vistas; a documentação cobre tabela, quadro, lista, calendário, galeria, cronograma, gráfico, mapa, feed e formulários.
- A busca oferece atalhos e consultas no espaço de trabalho e em bases de dados.

O modelo de dados da aplicação contém páginas, blocos, referências hierárquicas, favoritos e linhas de base de dados. A implementação oferece vistas de tabela, quadro, lista, calendário, galeria e linha do tempo, com datas de início e prazo. As mudanças são salvas no navegador.

```mermaid
flowchart LR
  U[Pessoa usuária] --> W[Interface React]
  W --> E[Editor de blocos]
  W --> D[Vistas de base de dados]
  W --> S[Busca e navegação]
  E --> L[(localStorage do navegador)]
  D --> L
  S --> L
  C[Coolify: container Nginx] -->|arquivos estáticos| W
```

## Escopo implementado e lacunas

Implementado nesta versão: navegação hierárquica, favoritos, edição e cópia/colagem de blocos, comandos de inserção, tarefas com checkbox, bases com seis vistas, propriedades básicas, busca local, filtro/ordenação, tema claro/escuro e backup JSON.

Fora do escopo: seleção/cópia estruturada de vários blocos, persistência do clipboard estruturado entre sessões, login, sincronização, colaboração em tempo real, permissões, comentários, integrações, API do Notion, anexos, propriedades avançadas, fórmulas, rollups, filtros combinados, vistas persistentes, relacionamento entre bases e paridade visual/comportamental completa. Não há serviço de backend; perfis de navegador não compartilham dados.

## Referências

- [Repositório REA](https://github.com/morluto/rea)
- [Estudo de caso REA do Notion Desktop](https://rea.tools/showcase/notion/)
- [Noções básicas de escrita e edição no Notion](https://www.notion.com/help/writing-and-editing-basics)
- [Vistas, filtros e ordenação no Notion](https://www.notion.com/en-gb/help/views-filters-and-sorts)
- [Propriedades de bases de dados no Notion](https://www.notion.com/help/database-properties)
- [Busca no Notion](https://www.notion.com/en-gb/help/search)
