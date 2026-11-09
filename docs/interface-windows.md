# Interface Windows — revisão de 09/11/2026

## Controles e contratos preservados

| Área | Controles e efeito |
| --- | --- |
| Início | Busca por nome/código e filtro; setas/Enter selecionam; Solicitar acesso envia o pedido explícito. Limpar remove a consulta. |
| Receber acesso | Abrir meu código inicia o cliente com o servidor configurado; download entrega o executável. |
| Agenda | Buscar, filtrar, adicionar, cancelar e salvar; selecionar retorna ao início com o código preenchido. |
| Histórico | Consulta somente leitura dos registros locais existentes; Atualizar refaz a consulta. Não contém nomes/códigos. |
| Ajuda e diagnóstico | Instruções por assunto, verificar conexão e detalhes técnicos. |
| Solicitação | Aguardando autorização, recusa, indisponibilidade e tentativa de encerramento têm mensagem e ação. |
| Sessão | Monitor, zoom, arquivos e tela cheia na barra; ferramentas, imagem, orientação e diagnóstico no grupo expansível. Encerrar fica sempre visível. |
| Arquivos | Navegar, subir pasta, enviar, receber, cancelar e fechar; painel no fluxo da página, sem sobrepor a imagem. |
| Cliente | Código legível acionável por mouse/Enter/Espaço, Copiar, Reconectar e atualização. Solicitação identifica o técnico e as permissões. Recusar/Encerrar revoga o atendimento. |

## Implementação

Fundo branco, navegação em cinza claro, texto grafite, ações azuis, bordas leves e Segoe UI. Removidos títulos promocionais e marca d'água das áreas de trabalho. A sessão entra em tela cheia somente por ação explícita; o botão muda para Sair da tela cheia. Coordenadas continuam usando o retângulo da imagem exibida e o cálculo existente de zoom/letterboxing.

O cliente mantém moldura nativa fixa, minimizar e fechar; maximizar permanece indisponível por ser uma janela de consentimento com tamanho fixo. O técnico mantém a moldura redimensionável e os comandos nativos. Copiar e reconectar agora têm botões visíveis. As operações assíncronas desabilitam a ação correspondente; encerrar informa o estado pendente.

## Evidências e limites

- `npm test`: 57 testes do domínio, autorização, armazenamento e encerramento.
- `test:search`: busca, filtros, teclado, seleção, consentimento explícito, responsividade e falha de carregamento.
- `test:design`: 11 estados auditados com axe, incluindo histórico vazio; larguras de 320 a 1440 pixels.
- `test:client`: abre ClientWindow real, verifica código persistente, aparência e limites dos controles. A interface HTML é exercitada no Edge com dados temporários. Recusa, offline, expiração, resposta atrasada e nova tentativa de encerramento são cobertos.
- `test:native-session`: cliente WinForms real recebe solicitação, revela a janela, aprova e encerra por botão. Não aplica entrada ao Windows.
- `native-technician-smoke.mjs`: janela real WinForms/WebView2, minimizar/maximizar/restaurar, redimensionar, escalas WebView2 100/125/150%, tela cheia, busca, vídeo H.264 sintético, dois monitores simulados, entrada Unicode num coletor e hashes de transferência. Fechar durante transferência verifica limpeza dos processos e arquivos parciais.
- ClientSmoke também renderiza o formulário com fatores de layout 100/125/150%, conferindo controles dentro da área. Esses fatores e o zoom WebView2 não substituem mudar o DPI do Windows ou mover a janela entre monitores de DPI diferente.
- Capturas e relatórios ficam em `artifacts/redesign-local`, `artifacts/native-technician`, `artifacts/voadesk` e `artifacts/support-local`, fora do Git e dos pacotes.
- A inspeção interativa pela skill computer-use não iniciou: módulo `@oai/sky` indisponível. A validação de janelas ocorreu pelos executáveis de QA que instanciam as classes reais do aplicativo.
- Permanecem pendentes: DPI real do Windows em três escalas, seletores nativos de arquivo operados manualmente, captura/entrada no Windows de outro computador e conexão entre redes. Pareamento, vídeo sintético apresentado e comandos recebidos no coletor são verificações distintas.

## Distribuição e Git

Os pacotes são `instalação/VoaDeskTecnico.zip` e `instalação/VoaDeskCliente.exe`. O ZIP requer extração completa e provisionamento autorizado do operador em um novo PC. Dados, configurações, binários gerados, caches e capturas continuam excluídos do Git. Commits novos descrevem a alteração; o histórico compartilhado não é reescrito com force push.
