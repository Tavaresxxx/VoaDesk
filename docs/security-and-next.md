# Proteção e evolução

## Implementado no incremento 01

Uma página local confiável e assets em allowlist; Node fora do renderer; escuta TCP somente em 127.0.0.1. Um segredo aleatório de 256 bits abre o aplicativo uma única vez em até 120 s e vira cookie efêmero HttpOnly/SameSite Strict. Origem exata, cabeçalho de mutação e Host verificados. Sem log de URL de bootstrap. Perfil dedicado do Edge. Sem CORS. Nenhuma API de shell/arquivo acessível à página. Histórico usa projeção de campos e limite de registros. Bootstrap/cookie não são códigos de suporte nem credenciais de identidade.

WebRTC usa ICE/DTLS-SRTP no loopback. Isso exercita o transporte criptográfico padrão, mas não prova segurança ponta a ponta entre identidades de duas pessoas: os peers estão no mesmo renderer e as descrições são trocadas em memória. HTTP em loopback serve exclusivamente este laboratório. Sem HTTPS remoto, autenticação de técnico ou servidor de sinalização implementados.

## Próximo incremento: duas máquinas e visualização autorizada

Implementar serviço único de autenticação/sinalização + banco persistente, sem vídeo no serviço. O cliente atendido cria uma sessão pelo canal autenticado do dispositivo efêmero; o técnico autentica por OIDC Authorization Code + PKCE usando navegador do sistema. Tokens curtos, audience restrita e refresh em cofre/DPAPI; não colocar client secret em executável. Escolher provedor e requisitos de conta antes de desenvolver o login.

Código de pareamento é localizador temporário, não identidade ou autorização suficiente. Usar CSPRNG, pelo menos 60 bits em formato humano (ex.: 12 símbolos Base32), validade de 5 min, hash/HMAC no banco, uma solicitação pendente e consumo atômico. Limitar erros por conta, IP e dispositivo com janela e atraso progressivo; código não pode ser bloqueado globalmente por qualquer atacante anônimo. Não revelar se um código existe antes da autenticação. Não registrar código, token ou query sensível.

Estado explícito: criado → solicitação → consentimento pendente → autorizado → conectando → ativo → revogado/encerrado/expirado. A autorização inclui IDs imutáveis da sessão, atendido, conta/técnico, identidade do dispositivo, permissões e prazo. O cliente mostra nome verificado do técnico e modo solicitado; controles e mídia só são liberados após resposta afirmativa vinculada a essa solicitação. Rejeitar replay, alteração de participante, sessão paralela, renegociação não autorizada e eventos tardios.

**Vínculo criptográfico a provar antes de uso remoto:** gerar chave efêmera por endpoint, autenticar a chave do técnico pela conta e assinatura de dispositivo e a do atendido pelo canal da sessão. Assinar transcript contendo session ID, ambos participant IDs, chaves públicas efêmeras, fingerprints DTLS dos dois SDP, nonces, permissões e expiração. Verificar nos clientes antes de aplicar SDP/candidatos e antes de liberar mídia/canal de controle. Exibir código curto de comparação derivado do transcript para verificação fora do servidor (protege contra troca pelo sinalizador quando verificado pelas pessoas). TLS sozinho não protege contra um sinalizador que substitui fingerprints. Sem verificação independente ou identidade de dispositivo confiável, documentar expressamente a confiança no servidor; não anunciar E2EE autenticada como resolvida.

ICE direto por STUN quando viável; coturn alternativo, com credenciais REST HMAC temporárias vinculadas à sessão e TTL curto (ex.: 10 min). TURN retransmite datagramas protegidos DTLS-SRTP; não termina chaves de mídia. Forçar `iceTransportPolicy=relay` em teste de aceitação e verificar candidato efetivo relay. O segredo compartilhado TURN fica somente no servidor. NAT simétrico, UDP bloqueado e TCP/TLS TURN precisam de testes próprios. Nunca compartilhar credencial TURN fixa entre clientes.

## Incremento seguinte: entrada autorizada

Canal de controle autenticado e vinculado ao transcript, separado da mídia. Teclas/botões e mudança de permissão por canal confiável e ordenado; movimentos do mouse por canal de baixa latência com sequência/TTL, orçamento de bytes e descarte de movimentos antigos. Sem backlog de movimentos. Mouse local é indicador local, cursor confirmado deve vir do atendido e ter desenho distinto. Não prever resposta como se fosse confirmação.

Permissão de controle avaliada no atendido a cada comando; token/generation de permissão invalida mensagens em voo. Manter conjunto de teclas/botões pressionados pelo técnico, liberar todos em perda de foco, heartbeat expirado, revogação, parada e desconexão. Helper não elevado usando SendInput com limites, coordenadas normalizadas para o monitor capturado, revisão de geometria e proteção contra injeções fora dessa geometria. Permissão de visualização não aceita input. Após revogação, nova autorização explícita; reconectar não restaura controle automaticamente.

Respeitar UIPI: processo não elevado não controla aplicações elevadas de maior integridade. UAC/área de trabalho segura e conteúdo protegido podem ficar indisponíveis/pretos; mostrar aviso e suspender controle. Não usar driver, serviço SYSTEM, uiAccess ou outros contornos neste escopo. Nada oculto, sem persistência/autostart.

## Critérios para avançar

1. Dois Windows 11 distintos, conta de teste, HTTPS real e consentimento em ambas as pontas.
2. Testes de código expirado/consumido, rate limit, troca de identidade, fingerprint, replay, negação de acesso e revogação durante mídia.
3. Revogação e desconexão com teclas/botões pressionados, inclusive durante congestionamento.
4. Testes direto/relay em redes diferentes e expiração da credencial TURN.
5. Relatório de imagem/latência/memória com hardware e condições; só depois empacotamento final.
