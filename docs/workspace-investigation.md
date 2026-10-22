# Investigação de workspaces e organização

Consulta: 22/10/2026. Este relatório orienta a reconstrução independente de organização, configurações, recuperação e reutilização. A documentação pública descreve o produto; as evidências REA abaixo descrevem somente artefatos estáticos. Uma categoria não substitui a outra.

## Perguntas e resultados

| Pergunta | Resultado | Base e limite |
| --- | --- | --- |
| Como criar e trocar workspaces? | Respondida pela documentação; implementação interna não resolvida. | Há um membro estático `workspaceSwitcher`, mas o traço não alcançou handler, estado ou persistência. |
| Como organizar teamspaces? | Respondida pela documentação; sem confirmação estática do fluxo completo. | Nome, descrição, ícone, páginas, arquivo e restauração são fluxos documentados. |
| Quais configurações são específicas do workspace? | Respondida parcialmente. | A documentação descreve metadados, pesquisa e exportação; permissões e políticas exigem identidade de usuários. |
| Como recuperar páginas e versões? | Respondida pela documentação; armazenamento interno desconhecido. | Lixeira e histórico são recursos distintos. Não foi identificado protocolo remoto ou esquema de versões pelo REA. |
| Como reutilizar páginas? | Respondida pela documentação. | Duplicação de páginas e modelos de bases atendem usos diferentes. |
| Como a aparência é persistida? | Comportamento documentado; implementação interna desconhecida. | Os controles de aparência são públicos; não foi estabelecido o formato persistido pelo Notion. |

## Evidência REA reutilizada e avanço focado

Alvo selecionado pelo usuário: Notion Desktop, `resources/app.asar`. A identidade foi revalidada nesta investigação: SHA-256 `afb4684fa08d12d7ccd3c89e2ad195de7047859d437e721689a5cbfc69403549`, igual à análise anterior. Não foi necessário analisar o pacote inteiro novamente.

Foi usado o CLI `rea-agents` 6.7.0 já disponível, sem instalar provedores nem alterar a configuração do cliente. A nova operação foi `trace-application-feature`, com seed de tipo `api`, valor `workspaceSwitcher` e direção `outgoing`.

O Evidence focado `ev_df7197a36039e07bb30b08af956484cb53304ba6a5ca597a03fcab66dc6fa894` analisa somente `.webpack/renderer/tab_browser_view/preload.js`; 160 arquivos inventariados permanecem fora da seleção. A projeção de fatos `ev_c6afac7d8dad1fb9836cb594db4c3a0bbf5910e7b5fbbc5f28e4203ad439bdc4` registra o nó `jag_node_e4c8798d9b1c3250baf87d655527d4678342a2c51eeaba7a1c7fafb85f5f2ec0`, uma API `contextBridge` chamada `__electronApi`.

No intervalo estático `2:398784–2:398848` desse preload, o REA infere, por substituição de wrapper, membros como `workspaceSwitcher`, `onOpenSettings`, `tabSpaces` e `showTabHistoryMenu`. A classificação da relação é inferida, com confiança alta. Os nomes não demonstram o funcionamento dos recursos. Em particular, histórico de abas não demonstra histórico de versões de páginas.

Para responder à pergunta concreta “o membro `workspaceSwitcher` permite rastrear a troca de workspace?”, executei um traço REA de saída sobre a evidência focada existente. Resultado novo: `ev_932b90e661d4bea9731227d4be7f2d740372a378649c268051ab4d6de1481d5f`. O traço encontrou um seed, um nó, zero arestas, zero caminhos terminais e nenhum handoff nativo. A correspondência foi o membro `observations[0].properties.members[226]` da API acima. Portanto, o nome está identificado, mas a implementação da troca permanece desconhecida.

O traço tem cobertura `partial` e informa que sua identidade de artefato isolada não está disponível. Sua atribuição ao alvo depende do `source_evidence_id` acima e da identidade revalidada da análise de origem. O grafo da análise de origem também é parcial e sua análise semântica é truncada. Nenhum desses resultados observou execução.

O snapshot web anterior contém pistas como `space_view`, mas a semântica desses rótulos não foi resolvida. O bundle denominado `UISpacePermissionGroupToken` foi marcado como ignorado pelo limite de saída estática. Seu nome não sustenta conclusões sobre permissões de workspace ou teamspace. Os detalhes e limites permanecem em [engenharia-reversa.md](engenharia-reversa.md).

As saídas completas, requests e bundles continuam fora do Git. O novo resultado local está em `../notion-preload-workspace-switcher-trace.json`, junto às demais evidências locais. O caminho é relativo à pasta do checkout e não é um artefato distribuído.

## Fluxos públicos úteis à reconstrução

### Workspaces

O seletor permite criar e alternar espaços vinculados à conta, além de adicionar outra conta. O Notion apresenta workspaces como conjuntos separados; movimentar páginas de topo também movimenta suas subpáginas. A documentação contém condições específicas para ingresso por domínio e convites. Esses mecanismos dependem de contas e membros reais. [Criar e alternar workspaces](https://www.notion.com/help/create-delete-and-switch-workspaces).

**Decisão para a versão independente:** manter um catálogo de workspaces com identificadores próprios e um ativo por vez. Páginas, favoritos, modelos, histórico e lixeira pertencem ao seu workspace. A troca não deve apagar conteúdo nem misturar busca e favoritos. A migração do formato anterior deve conservar o primeiro workspace integralmente.

### Teamspaces

Um teamspace recebe nome, descrição, ícone e modalidade de acesso. A documentação distingue aberto, fechado e privado, descreve membros e proprietários e permite adicionar ou mover páginas. Teamspaces são arquivados e podem ser restaurados nas configurações. As políticas podem herdar restrições do workspace. [Introdução aos teamspaces](https://www.notion.com/help/intro-to-teamspaces).

**Decisão para a versão independente:** criar áreas de organização dentro de cada workspace, com página raiz atribuída a uma área e descendentes que a acompanham. Arquivar a área preserva as páginas e permite restaurá-la. Enquanto houver somente armazenamento local e um usuário, rótulos de acesso não constituem controle de segurança; a interface deve explicar esse limite.

### Configurações

O Notion documenta pesquisa de configurações, nome e ícone próprios por workspace e exportação de conteúdo em formatos como HTML, Markdown e CSV. Alguns ajustes dependem do papel e do plano; a exportação respeita acesso às páginas. [Configurações de workspace](https://www.notion.com/help/workspace-settings).

**Decisão para a versão independente:** concentrar edição do nome e ícone, aparência, gestão de áreas e backup nas configurações. O backup deve informar seu escopo: workspace ativo ou catálogo inteiro. Arquivos de áudio em IndexedDB exigem exportação própria até existir um pacote que os inclua. Alterar a aparência de um espaço não deve modificar os demais.

### Lixeira, arquivo e histórico

A documentação permite pesquisar páginas na lixeira, visualizar, restaurar ou apagar definitivamente. Páginas apagadas não são editáveis. O histórico oferece prévia e restauração de versões; sua retenção varia por plano. Arquivar mantém o conteúdo acessível, com sinalização e diferenças de busca. [Excluir, arquivar e restaurar conteúdo](https://www.notion.com/help/duplicate-delete-and-restore-content).

**Decisão para a versão independente:** distinguir `deletedAt` de `archivedAt`. A exclusão de uma árvore deve permitir restauração coerente de seus descendentes. Capturar uma versão antes de substituir conteúdo e conservar a versão atual quando uma antiga for restaurada. Definir e mostrar o limite local de snapshots. Apagar definitivamente deve ser uma ação explícita; não copiar automaticamente os prazos de retenção do serviço Notion.

### Modelos

A documentação sugere manter uma página base e duplicá-la quando necessário; modelos adicionados ao workspace podem ser adaptados. [Começar com um modelo](https://www.notion.com/help/start-with-a-template). Em bases, modelos incluem propriedades e conteúdo, são específicos da base e podem gerar páginas repetidamente conforme uma agenda. Relações preenchidas no modelo se repetem nas novas páginas. [Modelos de bases](https://www.notion.com/help/database-templates).

**Decisão para a versão independente:** fornecer galeria de modelos próprios e permitir salvar uma página como modelo local. A criação deve atribuir IDs novos a páginas, blocos, comentários e ações de reunião; não copiar gravações ou histórico. Modelos de bases e recorrência devem ser implementados como recursos próprios, com estado e execução definidos; uma galeria de páginas não representa essas duas capacidades.

### Aparência e proteção contra edições

A documentação descreve fonte padrão, serifa e monoespaçada, texto pequeno, largura total, ícones, capas, cores e ações no menu da página. As opções disponíveis dependem do tipo da página e do acesso. [Personalizar páginas](https://www.notion.com/help/customize-and-style-your-content).

**Decisão para a versão independente:** persistir fonte, tamanho e largura por página e fornecer estado de bloqueio com comando claro de desbloquear. Bloqueio local previne alterações acidentais; autorização entre usuários exige implementação no servidor.

## Matriz de lacunas para a próxima entrega

Esta matriz é uma ordem de implementação, não uma declaração de recursos já concluídos.

| Prioridade | Capacidade | Critério verificável da reconstrução | O que permanece além do escopo local |
| --- | --- | --- | --- |
| P0 | Vários workspaces | Criar, renomear, alternar, preservar o legado e manter dados separados. | Conta, associação, convite e sincronização. |
| P0 | Configurações | Nome, ícone, aparência e exportação aplicados ao espaço correto. | SSO, domínio confiável, faturamento e administração remota. |
| P0 | Teamspaces | Criar, editar, mover páginas, arquivar e restaurar sem perder árvore. | Papéis, associação de membros e política efetiva de acesso. |
| P0 | Lixeira | Excluir árvore, pesquisar e restaurar sem quebrar parentesco. | Retenção remota e recuperação por suporte. |
| P0 | Histórico | Mostrar snapshots com prévia e restaurar conservando a versão substituída. | Auditoria de vários autores e convergência concorrente. |
| P1 | Biblioteca de modelos | Criar páginas de modelos próprios e salvar modelos reutilizáveis com IDs novos. | Marketplace, compra, licenças e recorrência no servidor. |
| P1 | Arquivo de páginas | Distinguir arquivadas de apagadas; manter navegação e restauração. | Políticas de retenção e busca empresarial. |
| P1 | Aparência e bloqueio | Persistir apresentação e bloquear edição acidental por página. | Permissões efetivas por usuário. |
| P1 | Backup do catálogo | Exportar/importar todos os espaços e validar referências antes de aplicar. | Backup remoto e mídia incluída em pacote único. |
| P2 | Colaboração | Definir autenticação, membros, papéis, convites e persistência no servidor. | Paridade com infraestrutura interna do Notion não estabelecida. |

## Incógnitas preservadas

Não foram estabelecidos o esquema interno de workspaces/teamspaces, endpoints autenticados, modelo de autorização, transações de movimentação, armazenamento de versões, protocolo de colaboração ou comportamento dos recursos em runtime. Nesta investigação não houve navegação na conta do usuário, captura de tráfego, extração de dados da conta nem execução dos bundles. A implementação independente deve atribuir suas próprias estruturas e contratos e apresentar suas limitações de armazenamento e colaboração com clareza.
