import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { GeminiEmbeddings } from '../gemini/gemini-embeddings';

dotenv.config();

async function runMigration() {
  console.log('========================================================');
  console.log('🚀 SCRIPT DE MIGRACIÓN: RE-INDEXACIÓN DE EMBEDDINGS GEMINI');
  console.log('========================================================');

  const mongoUri = process.env.MONGODB_ATLAS_URI;
  const dbName = process.env.MONGODB_ATLAS_DB_NAME || 'publicbotdb';
  const sourceColName = process.env.SOURCE_COLLECTION || 'nomicvectors';
  const targetColName = process.env.TARGET_COLLECTION || process.env.MONGODB_ATLAS_COLLECTION_NAME || 'geminivectors';
  const dimensions = parseInt(process.env.VECTOR_DIMENSIONS || '768', 10);

  if (!mongoUri) {
    console.error('❌ MONGODB_ATLAS_URI no está definido en el archivo .env');
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY no está definido en el archivo .env');
    process.exit(1);
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  console.log(`✅ Conectado a MongoDB Atlas (${dbName})`);

  const db = client.db(dbName);
  const sourceCol = db.collection(sourceColName);
  const targetCol = db.collection(targetColName);

  const totalSourceDocs = await sourceCol.countDocuments();
  console.log(`📄 Documentos encontrados en origen '${sourceColName}': ${totalSourceDocs}`);

  if (totalSourceDocs === 0) {
    console.log('ℹ️ No hay documentos para migrar en la colección de origen.');
    await client.close();
    return;
  }

  const embeddingsService = new GeminiEmbeddings({
    apiKey,
    model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    outputDimensionality: dimensions,
  });

  console.log(`🤖 Generador de Embeddings inicializado: ${embeddingsService.model} (${dimensions} dims)`);

  const cursor = sourceCol.find({});
  let processed = 0;
  let batchDocs: any[] = [];
  const batchSize = 20;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;

    const text = doc.document || doc.texto || doc.text || doc.contenido;
    if (!text || !text.trim()) {
      continue;
    }

    batchDocs.push({
      originalId: doc._id,
      text: text.trim(),
      metadata: doc.metadata || {},
      createdAt: doc.createdAt || new Date(),
    });

    if (batchDocs.length >= batchSize) {
      await processBatch(batchDocs, embeddingsService, targetCol);
      processed += batchDocs.length;
      console.log(`⏳ Progreso: ${processed}/${totalSourceDocs} documentos procesados.`);
      batchDocs = [];
    }
  }

  if (batchDocs.length > 0) {
    await processBatch(batchDocs, embeddingsService, targetCol);
    processed += batchDocs.length;
    console.log(`⏳ Progreso: ${processed}/${totalSourceDocs} documentos procesados.`);
  }

  console.log(`\n🎉 Migración completada: ${processed} documentos re-indexados con éxito en '${targetColName}'`);

  // Intentar crear/verificar el Search Index
  try {
    console.log(`🔧 Creando/verificando índice vectorial en '${targetColName}'...`);
    const indexDef = {
      name: 'vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: dimensions,
            similarity: 'cosine',
          },
        ],
      },
    };
    await targetCol.createSearchIndex(indexDef);
    console.log('✅ Índice vectorial creado exitosamente en Atlas.');
  } catch (idxError: any) {
    if (idxError?.message?.includes('already exists')) {
      console.log('ℹ️ El índice vectorial ya existe en la colección de destino.');
    } else {
      console.warn(`⚠️ Nota sobre creación de índice: ${idxError.message}`);
    }
  }

  await client.close();
  console.log('🏁 Proceso finalizado.');
}

async function processBatch(
  batch: any[],
  embeddingsService: GeminiEmbeddings,
  targetCol: any,
) {
  const texts = batch.map((b) => b.text);
  const embeddings = await embeddingsService.embedDocuments(texts);

  const operations = batch.map((item, index) => {
    return {
      updateOne: {
        filter: { _id: item.originalId },
        update: {
          $set: {
            document: item.text,
            embedding: embeddings[index],
            metadata: item.metadata,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: item.createdAt,
          },
        },
        upsert: true,
      },
    };
  });

  if (operations.length > 0) {
    await targetCol.bulkWrite(operations);
  }
}

runMigration().catch((err) => {
  console.error('❌ Error fatal durante la migración:', err);
  process.exit(1);
});
