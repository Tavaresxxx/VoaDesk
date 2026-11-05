# Configuração do host

## Executável hoje

`node src/host/server.mjs --open` inicia HTTP somente em `127.0.0.1` numa porta dinâmica, consulta `dist/FarolProbe.exe` e abre Edge em modo aplicativo. Não abrir firewall, não publicar a porta, não usar proxy para expor este host. Ele não é um servidor de sessões remotas. Não recebe vídeo, teclado, SDP ou candidatos.

Configuração de produção não foi instalada. Nenhuma conta cloud ou domínio foi criado. Rede deste ambiente bloqueou o download npm. Node/Edge instalados são pré-requisitos, não são redistribuídos no repositório.

## Preparação do servidor remoto — ainda não executável

Na fase 03: um serviço de autenticação/sinalização com banco e HTTPS/WSS. Preferir um único processo e migrações explícitas; banco com sessões, participantes, permissões, códigos consumidos e eventos agregados. Sessões precisam de atualizações atômicas; usar relógio servidor para expiração, tolerância explícita para relógios dos clientes e idempotência nas transições. Proxy TLS com domínio/certificado real, limites de corpo/conexões/tentativas, sem logs de query, SDP ou códigos. A API administrativa só deve existir se houver necessidade real.

Variáveis a definir nessa implementação: `PUBLIC_ORIGIN`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `DATABASE_URL`, `SESSION_SIGNING_KEY`, `CODE_HASH_PEPPER`, `TURN_URLS`, `TURN_SHARED_SECRET`. Usar secret store/env do serviço; arquivo `.env` fora do controle de versão. Não usar valores de exemplo como chaves reais. API e coturn compartilham somente o segredo REST TURN. Custos e publicação exigem decisão separada.

Na fase 05: coturn em host com IP público, DNS, TLS e portas ICE acessíveis. Esboço de configuração (não foi implantado ou validado):

```ini
# SUBSTITUIR antes do uso; não é um arquivo pronto para produção.
fingerprint
use-auth-secret
static-auth-secret=SUBSTITUIR_POR_SEGREDO_ALEATORIO_NO_SERVIDOR
realm=turn.seu-dominio.example
listening-port=3478
tls-listening-port=5349
min-port=49160
max-port=49260
# cert=/caminho/fullchain.pem
# pkey=/caminho/privkey.pem
no-loopback-peers
no-multicast-peers
no-cli
```

Configurar `external-ip` apenas se houver NAT no próprio servidor, limites de banda/cotas e negar destinos privados conforme topologia para não criar relay interno abusável. Validar sintaxe da versão escolhida de coturn. Credenciais de curta duração são geradas pelo serviço via mecanismo REST documentado do coturn; o cliente nunca recebe `TURN_SHARED_SECRET`. Testar UDP 3478, TCP/TLS 5349 e a faixa de relay; 443/TLS alternativo só com desenho de rede explícito. Sem presumir que liberar 443 da API libera o TURN.

Fontes de referência para a implementação futura: https://github.com/coturn/coturn e https://www.w3.org/TR/webrtc/. Não executar o esboço como alegação de suporte a retransmissão.
