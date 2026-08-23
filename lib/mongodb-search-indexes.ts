import { DEFAULT_MONGODB_SEARCH_INDEX } from './mongodb-search';

const textField = (tokenization: 'edgeGram' | 'nGram' = 'edgeGram') => [
  { type: 'string', analyzer: 'lucene.standard' },
  {
    type: 'autocomplete',
    analyzer: 'lucene.standard',
    tokenization,
    minGrams: 2,
    maxGrams: 15,
    foldDiacritics: true,
  },
];

const identifierField = () => [
  { type: 'string', analyzer: 'lucene.keyword' },
  {
    type: 'autocomplete',
    analyzer: 'lucene.keyword',
    tokenization: 'nGram',
    minGrams: 2,
    maxGrams: 15,
    foldDiacritics: true,
  },
];

const entityFields = {
  userId: { type: 'token' },
  searchIdentifiers: identifierField(),
  name: textField('edgeGram'),
  phone: identifierField(),
  email: identifierField(),
  address: textField('edgeGram'),
};

export const MONGODB_SEARCH_INDEXES = [
  {
    collection: 'inventory',
    name: DEFAULT_MONGODB_SEARCH_INDEX,
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          userId: { type: 'token' },
          itemName: textField('edgeGram'),
          itemNumber: identifierField(),
          itemNumberKey: identifierField(),
          searchIdentifiers: identifierField(),
          uniqueCode: identifierField(),
          brand: textField('edgeGram'),
          location: textField('edgeGram'),
          supplier: textField('edgeGram'),
          description: textField('edgeGram'),
        },
      },
    },
  },
  ...['customers', 'suppliers'].map((collection) => ({
    collection,
    name: DEFAULT_MONGODB_SEARCH_INDEX,
    definition: {
      mappings: { dynamic: false, fields: entityFields },
    },
  })),
  {
    collection: 'customEntities',
    name: DEFAULT_MONGODB_SEARCH_INDEX,
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          ...entityFields,
          collectionType: [{ type: 'token' }, ...textField('edgeGram')],
        },
      },
    },
  },
  {
    collection: 'invoices',
    name: DEFAULT_MONGODB_SEARCH_INDEX,
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          userId: { type: 'token' },
          invoiceNumber: identifierField(),
          searchIdentifiers: identifierField(),
          customerName: textField('edgeGram'),
          customerPhone: identifierField(),
        },
      },
    },
  },
] as const;
