const err = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
const secured = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'API de Agendamento de Salas de Reunião',
    version: '1.0.0',
    description: [
      'MVP para agendar e gerenciar salas de reunião, evitando conflitos entre times.',
      '',
      '**Acesso restrito a funcionários**: todos os endpoints (exceto `/auth/login`, `/auth/register` e `/health`) exigem JWT.',
      'Faça login em `POST /auth/login`, copie o `token` e clique em **Authorize** (cadeado).',
      '',
      '**Regras de negócio**',
      '- RN1: não há limite máximo de duração de uma reunião.',
      '- RN2: é possível estender uma reunião (`PATCH /bookings/{id}/extend`) se não houver outra no intervalo estendido.',
      '- RN3: não é permitido agendar no passado (início deve ser >= minuto atual).',
      '- RN4: não é permitido agendar em horário que já tenha reunião na mesma sala (reuniões "encostadas" são permitidas).',
      '',
      '**Datas**: ISO-8601 **com fuso horário**, ex.: `2026-11-10T14:00:00-03:00` ou `2026-11-10T17:00:00Z`.',
    ].join('\n'),
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  tags: [
    { name: 'Auth' },
    { name: 'Funcionários', description: 'Gestão de funcionários (admin)' },
    { name: 'Salas' },
    { name: 'Reuniões' },
    { name: 'Sistema' },
  ],
  paths: {
    '/health': {
      get: { tags: ['Sistema'], summary: 'Healthcheck (público)', responses: { 200: { description: 'OK' } } },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login de funcionário (retorna JWT)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: { email: 'admin@empresa.com', password: 'admin123' },
            },
          },
        },
        responses: {
          200: {
            description: 'Autenticado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          400: err('Dados inválidos'),
          401: err('Credenciais inválidas'),
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Cadastro de funcionário (público)',
        description: [
          'Cria uma conta com perfil `employee` usando nome, e-mail corporativo e senha.',
          '',
          '- RN1: o e-mail deve ser do domínio da empresa (`@empresadorafa.com`).',
          '- RN2: a senha deve ter no mínimo 8 caracteres.',
          '- RN3: não é permitido cadastrar dois usuários com o mesmo e-mail.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
              example: { name: 'Maria Silva', email: 'maria@empresadorafa.com', password: 'senha1234' },
            },
          },
        },
        responses: {
          201: { description: 'Cadastrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          400: err('Dados inválidos (senha curta, e-mail malformado)'),
          409: err('E-mail já cadastrado (EMPLOYEE_ALREADY_EXISTS)'),
          422: err('E-mail fora do domínio da empresa (INVALID_EMAIL_DOMAIN)'),
        },
      },
    },
    '/me': {
      get: {
        tags: ['Auth'],
        summary: 'Dados do funcionário autenticado',
        security: secured,
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          401: err('Não autenticado'),
        },
      },
    },
    '/employees': {
      get: {
        tags: ['Funcionários'],
        summary: 'Lista funcionários (admin)',
        security: secured,
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Employee' } } } },
          },
          401: err('Não autenticado'),
          403: err('Requer admin'),
        },
      },
      post: {
        tags: ['Funcionários'],
        summary: 'Cadastra funcionário (admin)',
        security: secured,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateEmployee' },
              example: { name: 'Maria Silva', email: 'maria@empresa.com', password: 'senha123', role: 'employee' },
            },
          },
        },
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          400: err('Dados inválidos'),
          401: err('Não autenticado'),
          403: err('Requer admin'),
          409: err('E-mail já cadastrado'),
        },
      },
    },
    '/rooms': {
      get: {
        tags: ['Salas'],
        summary: 'Lista salas e se estão em uso agora',
        description: 'Retorna `inUse`, a reunião em andamento (`currentBooking`) e a próxima (`nextBooking`).',
        security: secured,
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } },
          },
          401: err('Não autenticado'),
        },
      },
      post: {
        tags: ['Salas'],
        summary: 'Cadastra sala (admin)',
        security: secured,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateRoom' },
              example: { name: 'Sala Cinza', capacity: 8 },
            },
          },
        },
        responses: {
          201: { description: 'Criada' },
          400: err('Dados inválidos'),
          401: err('Não autenticado'),
          403: err('Requer admin'),
          409: err('Nome de sala já existe'),
        },
      },
    },
    '/bookings': {
      get: {
        tags: ['Reuniões'],
        summary: 'Lista reuniões agendadas (agenda)',
        description: 'Filtros opcionais. `from`/`to` retornam reuniões que se sobreponham à janela informada.',
        security: secured,
        parameters: [
          { name: 'roomId', in: 'query', schema: { type: 'integer' } },
          { name: 'employeeId', in: 'query', schema: { type: 'integer' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, example: '2026-11-10T00:00:00-03:00' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, example: '2026-11-11T00:00:00-03:00' },
        ],
        responses: {
          200: {
            description: 'OK (ordenado por início)',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Booking' } } } },
          },
          400: err('Filtro inválido'),
          401: err('Não autenticado'),
        },
      },
      post: {
        tags: ['Reuniões'],
        summary: 'Agenda uma reunião (RN3 e RN4)',
        security: secured,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateBooking' },
              example: { roomId: 1, title: 'Planning do time A', start: '2026-11-10T14:00:00-03:00', end: '2026-11-10T15:00:00-03:00' },
            },
          },
        },
        responses: {
          201: { description: 'Agendada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } },
          400: err('Dados inválidos'),
          401: err('Não autenticado'),
          404: err('Sala não encontrada'),
          409: err('Conflito: já existe reunião nesse horário (RN4)'),
          422: err('Data/hora no passado (RN3)'),
        },
      },
    },
    '/bookings/{id}': {
      get: {
        tags: ['Reuniões'],
        summary: 'Detalha uma reunião',
        security: secured,
        parameters: [idParam],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } },
          401: err('Não autenticado'),
          404: err('Não encontrada'),
        },
      },
      delete: {
        tags: ['Reuniões'],
        summary: 'Cancela uma reunião (organizador ou admin)',
        security: secured,
        parameters: [idParam],
        responses: {
          204: { description: 'Cancelada' },
          401: err('Não autenticado'),
          403: err('Sem permissão'),
          404: err('Não encontrada'),
        },
      },
    },
    '/bookings/{id}/extend': {
      patch: {
        tags: ['Reuniões'],
        summary: 'Estende o horário de término (RN2)',
        description: 'Só é permitido se não houver outra reunião na sala no intervalo entre o fim atual e o novo fim.',
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ExtendBooking' },
              example: { end: '2026-11-10T16:00:00-03:00' },
            },
          },
        },
        responses: {
          200: { description: 'Estendida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } },
          400: err('Novo fim inválido (deve ser posterior ao atual)'),
          401: err('Não autenticado'),
          403: err('Sem permissão'),
          404: err('Não encontrada'),
          409: err('Conflito com outra reunião (RN2)'),
          422: err('Reunião já terminou'),
        },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string', example: 'BOOKING_CONFLICT' }, message: { type: 'string' } },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
      },
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Maria Silva' },
          email: { type: 'string', example: 'maria@empresadorafa.com' },
          password: { type: 'string', minLength: 8 },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
          employee: { $ref: '#/components/schemas/Employee' },
        },
      },
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'employee'] },
        },
      },
      CreateEmployee: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['admin', 'employee'], default: 'employee' },
        },
      },
      CreateRoom: {
        type: 'object',
        required: ['name', 'capacity'],
        properties: { name: { type: 'string' }, capacity: { type: 'integer', minimum: 1 } },
      },
      BookingBrief: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          employeeName: { type: 'string' },
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
        },
      },
      Room: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          capacity: { type: 'integer' },
          inUse: { type: 'boolean' },
          currentBooking: { $ref: '#/components/schemas/BookingBrief' },
          nextBooking: { $ref: '#/components/schemas/BookingBrief' },
        },
      },
      CreateBooking: {
        type: 'object',
        required: ['roomId', 'title', 'start', 'end'],
        properties: {
          roomId: { type: 'integer' },
          title: { type: 'string' },
          start: { type: 'string', format: 'date-time', description: 'ISO-8601 com fuso' },
          end: { type: 'string', format: 'date-time', description: 'ISO-8601 com fuso' },
        },
      },
      ExtendBooking: {
        type: 'object',
        required: ['end'],
        properties: { end: { type: 'string', format: 'date-time', description: 'Novo término (ISO-8601 com fuso)' } },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          roomId: { type: 'integer' },
          roomName: { type: 'string' },
          employeeId: { type: 'integer' },
          employeeName: { type: 'string' },
          title: { type: 'string' },
          start: { type: 'string', format: 'date-time', description: 'Sempre em UTC' },
          end: { type: 'string', format: 'date-time', description: 'Sempre em UTC' },
        },
      },
    },
  },
};
