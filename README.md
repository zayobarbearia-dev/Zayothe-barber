# Zayothe Barber

Site de agendamento com painel administrativo privado e PostgreSQL.

## Configuração no Railway

1. Adicione um serviço PostgreSQL ao projeto Railway.
2. No serviço web, configure:
   - `DATABASE_URL`: referência à variável `DATABASE_URL` do serviço PostgreSQL (por exemplo, `${{Postgres.DATABASE_URL}}`; ajuste o nome do serviço se necessário).
   - `SESSION_SECRET`: uma chave aleatória longa e exclusiva.
   - `ADMIN_EMAIL`: e-mail autorizado para o primeiro acesso.
   - `ADMIN_PASSWORD`: senha forte para o primeiro acesso.
   - `NODE_ENV`: `production`.
3. Faça deploy. As tabelas são criadas automaticamente na inicialização.
4. Acesse `/admin` no domínio publicado pelo Railway.

O primeiro administrador é criado com `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Se o e-mail já existir na tabela admins, alterar essas variáveis não troca a senha automaticamente; faça a redefinição diretamente no banco com uma senha bcrypt ou solicite uma rotina segura de redefinição.

## Recursos

- Agendamento público com gravação no PostgreSQL.
- Bloqueio de dois agendamentos para a mesma data e hora.
- Login administrativo por sessão, senha armazenada com bcrypt e limite de tentativas.
- Painel com resumo, agenda e alteração do status dos agendamentos.
- Edição de serviços, preços e ativação/desativação.

## Observações

- Nunca coloque senhas, tokens ou `SESSION_SECRET` no GitHub.
- O WhatsApp ainda não envia confirmações automaticamente. A integração oficial depende da configuração da plataforma WhatsApp Business/Meta.
- O banco mantém um único agendamento por horário, independentemente do status atual. Para liberar um horário cancelado para nova reserva, será necessário ajustar essa regra.
