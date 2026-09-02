---
title: TorrStremio
emoji: 🎬
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
---

# 🎬 TorrStremio

**[🇧🇷 Português](#) · [🇺🇸 English](README.en.md)**

Addon para Stremio que busca torrents no **Prowlarr**/**Jackett** e transmite direto via **[TorrServer](https://github.com/YouROK/TorrServer)** — com seek de verdade (avançar/voltar sem re-baixar o arquivo do zero), sem depender de serviço debrid nem de qBittorrent.

---

## O que ele faz

- **Busca** filmes, séries e animes em todos os indexadores configurados no seu Prowlarr (ou Jackett).
- **Filtra e prioriza** por idioma, palavra-chave, indexador e qualidade — do jeito que você configurar.
- **Transmite** pelo TorrServer, que baixa e reprioriza os pedaços do torrent sob demanda conforme você assiste, permitindo pular pra qualquer ponto do vídeo sem esperar o download completar.
- **Formata** o nome e a descrição de cada stream do seu jeito, com um construtor de template baseado em tokens (tamanho, resolução, seeders, idioma, grupo de release, etc.) — parecido com o que addons como o MediaFusion oferecem.
- **Ordena/agrupa** os resultados pela prioridade que você escolher: palavra-chave, idioma, resolução, qualidade, tamanho, seeders ou indexador.
- **Catálogo opcional** com os lançamentos mais recentes dos seus indexadores direto na home do Stremio.

Não há suporte a Real-Debrid, TorBox, StremThru ou magnet puro P2P — o addon foi enxugado de propósito pra fazer bem uma coisa: Prowlarr/Jackett buscando, TorrServer entregando.

---

## Como rodar

A forma recomendada é com Docker Compose. O repositório já traz um [`docker-compose.yaml`](docker-compose.yaml) pronto com Redis, Prowlarr e TorrServer:

```bash
git clone https://github.com/juniorterin/prowjack.git torrstremio
cd torrstremio

# Preencha JACKETT_API_KEY, ADDON_PUBLIC_URL, ACCESS_TOKEN e TS_PUBLIC_URL
cp .env.example .env

docker compose up -d
```

O addon sobe na porta `7860`. Coloque um proxy reverso (Coolify, Traefik, Nginx...) na frente se for expor pra internet, e aponte `ADDON_PUBLIC_URL`/`TS_PUBLIC_URL` pros endereços públicos correspondentes.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JACKETT_URL` | sim | URL do Prowlarr ou Jackett |
| `JACKETT_API_KEY` | sim | API key do Prowlarr/Jackett |
| `TS_URL` | sim | URL interna do TorrServer |
| `TS_PUBLIC_URL` | recomendada | URL que o **player** do Stremio vai acessar, se for diferente de `TS_URL` (ex: atrás de proxy reverso) |
| `TS_USER` / `TS_PASS` | não | Basic auth do TorrServer, se protegido |
| `REDIS_URL` | recomendada | Cache de buscas — sem isso, cai para cache em memória (perdido a cada reinício) |
| `ADDON_PUBLIC_URL` | recomendada | URL pública do addon, atrás de proxy/hosting |
| `ACCESS_TOKEN` | não | Trava o addon contra uso não autorizado |
| `CONFIG_DATA_DIR` / `CONFIG_DATABASE_URL` | não | Onde salvar as configurações `cfg_...` geradas pela UI — arquivo local ou Postgres |
| `TMDB_API_KEY` / `TMDB_BEARER_TOKEN` | não | Enriquece título/sinopse em pt-BR no catálogo |
| `RSS_CATALOG_INDEXERS` | não | Quais indexers alimentam o catálogo de lançamentos recentes |
| `SCRAP_MANIFEST_URLS` | não | Manifests de outros addons Stremio pra somar aos resultados do Prowlarr/Jackett |
| `ALLOWED_ORIGINS` | não | Origens permitidas por CORS (padrão: todas) |

A lista completa, com comentários, está em [`.env.example`](.env.example).

---

## Configurando no Stremio

1. Com o addon rodando, acesse `http://SEU_SERVIDOR:7860/configure` no navegador.
2. **Indexadores** — escolha quais indexadores e categorias (filmes/séries/anime) participam da busca.
3. **Filtros** — idioma prioritário, palavras-chave de boost, indexadores prioritários, limites de resultado.
4. **Formatação** — monte como o nome e a descrição de cada stream aparecem no Stremio, usando tokens como `{resolution}`, `{size}`, `{seeders}`, `{language}`; uma prévia ao vivo mostra o resultado real.
5. **Ordenação** — defina a ordem de prioridade dos critérios de ranking (o primeiro da lista domina, funcionando como "agrupar por").
6. **Catálogo** — liga/desliga o catálogo de lançamentos recentes na home do Stremio.
7. **Instalação** — dê um nome ao addon, gere o link e instale no Stremio (ou copie o link do manifest).

Voltar em `/cfg_.../configure` com o link gerado recarrega a configuração salva pra edição.

### Tokens de formatação disponíveis

`{addon}` `{title}` `{year}` `{season}` `{resolution}` `{quality}` `{codec}` `{size}` `{seeders}` `{language}` `{audio}` `{visual}` `{group}` `{indexer}`

Cada linha do template é independente: se todos os tokens dela vierem vazios pro resultado atual (por exemplo, `{audio}` quando o release não informa áudio), a linha inteira some — sem precisar de lógica condicional.

---

## Privacidade e segurança

- **Auto-hospedado** — suas chaves de API e configurações não passam por servidores de terceiros.
- **`ACCESS_TOKEN`** trava o addon contra acesso não autorizado.
- Validações contra *path traversal*, *ReDoS* e CORS restrito.

---

*Desenvolvido pela comunidade, para a comunidade.* 🍿
