import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function seedAdmin() {
  const uri = process.env.MONGODB_ATLAS_URI;
  if (!uri) {
    console.error('❌ MONGODB_ATLAS_URI no está definido en el archivo .env');
    process.exit(1);
  }

  console.log('🔄 Conectando a MongoDB Atlas...');
  const conn = await mongoose.connect(uri);
  console.log('✅ Conexión establecida con MongoDB Atlas');

  const usersCollection = conn.connection.collection('users');

  // Datos del Administrador sin contraseña (autenticación exclusivamente vía OTP por correo)
  const adminData = {
    _id: new mongoose.Types.ObjectId('6a73ac29d06ab1f8d8603a39'),
    identificacion: 86049796,
    nombre: 'Nestor',
    apellido: 'Diaz',
    correo_sena: 'nadiazc@sena.edu.co',
    numero_celular: '3007804185',
    rol_asignado: 'Administrador',
    estado_actual: true,
    usuario_asignado: 'nadiazc',
    createdAt: new Date('2026-08-05T21:33:29.246Z'),
    updatedAt: new Date(),
  };

  const existing = await usersCollection.findOne({
    $or: [
      { correo_sena: adminData.correo_sena },
      { identificacion: adminData.identificacion },
      { _id: adminData._id },
    ],
  });

  if (existing) {
    console.log(`ℹ️ Usuario existente encontrado (ID: ${existing._id}). Actualizando a modo passwordless (OTP)...`);
    await usersCollection.updateOne(
      { _id: existing._id },
      {
        $set: {
          identificacion: adminData.identificacion,
          nombre: adminData.nombre,
          apellido: adminData.apellido,
          correo_sena: adminData.correo_sena,
          numero_celular: adminData.numero_celular,
          rol_asignado: adminData.rol_asignado,
          estado_actual: adminData.estado_actual,
          usuario_asignado: adminData.usuario_asignado,
          updatedAt: new Date(),
        },
        $unset: {
          password: '',
          otpCode: '',
          otpExpiresAt: '',
        },
      }
    );
    console.log('✅ Usuario Administrador actualizado sin contraseñas.');
  } else {
    console.log('➕ Creando nuevo usuario Administrador passwordless...');
    await usersCollection.insertOne(adminData);
    console.log('✅ Usuario Administrador insertado con éxito con _id:', adminData._id.toString());
  }

  const finalUser = await usersCollection.findOne({ correo_sena: adminData.correo_sena });
  console.log('\n📄 Usuario Administrador en la base de datos (sin campo password):');
  console.dir(finalUser, { depth: null });

  await mongoose.disconnect();
  console.log('\n🔒 Desconectado de MongoDB.');
}

seedAdmin().catch((err) => {
  console.error('❌ Error en el seeder:', err);
  process.exit(1);
});
