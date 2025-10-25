const express = require('express');
const app = express();

app.use(express.json());

// Credenciais FatSecret
const CLIENT_ID = '87221632f6614e4280ab4bdcd93dbf85';
const CLIENT_SECRET = 'b1854912096c434983bf4e6ac001dcc7';

// Endpoint para buscar alimentos
app.post('/api/search', async (req, res) => {
  try {
    const { alimento } = req.body;
    
    if (!alimento) {
      return res.status(400).json({ error: 'Alimento é obrigatório' });
    }
    
    console.log(`🔍 Buscando: ${alimento}`);
    
    // 1. Obter token OAuth2
    const tokenResponse = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&scope=basic`
    });
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // 2. Buscar alimento
    const searchUrl = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(alimento)}&format=json&max_results=1&region=BR&language=pt`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const searchData = await searchResponse.json();
    
    // DEBUG: Mostrar resposta completa da API
    console.log('📦 Resposta FatSecret Search:', JSON.stringify(searchData, null, 2));
    
    // 3. Se encontrou, buscar detalhes
    if (searchData.foods && searchData.foods.food && searchData.foods.food.length > 0) {
      const food = searchData.foods.food[0];
      
      console.log(`✅ Encontrado: ${food.food_name}`);
      
      const detailUrl = `https://platform.fatsecret.com/rest/server.api?method=food.get.v2&food_id=${food.food_id}&format=json`;
      
      const detailResponse = await fetch(detailUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const detailData = await detailResponse.json();
      
      // 4. Processar e normalizar para 100g
      let serving = detailData.food.servings.serving;
      let dadosNutricionais;
      
      if (Array.isArray(serving)) {
        dadosNutricionais = serving.find(s => 
          s.metric_serving_unit === 'g' && 
          parseFloat(s.metric_serving_amount) === 100
        ) || serving[0];
      } else {
        dadosNutricionais = serving;
      }
      
      const servingAmount = parseFloat(dadosNutricionais.metric_serving_amount || 100);
      const fator100g = 100 / servingAmount;
      
      const resultado = {
        encontrado: true,
        alimento: food.food_name,
        food_id: food.food_id,
        energia_kcal: Math.round(parseFloat(dadosNutricionais.calories || 0) * fator100g),
        proteinas_g: Math.round(parseFloat(dadosNutricionais.protein || 0) * fator100g * 10) / 10,
        carboidratos_g: Math.round(parseFloat(dadosNutricionais.carbohydrate || 0) * fator100g * 10) / 10,
        gorduras_g: Math.round(parseFloat(dadosNutricionais.fat || 0) * fator100g * 10) / 10
      };
      
      console.log(`📊 ${resultado.alimento}: ${resultado.energia_kcal}kcal`);
      
      return res.json(resultado);
    } else {
      console.log(`❌ Não encontrado na FatSecret`);
      console.log('📦 Resposta vazia ou inválida:', JSON.stringify(searchData, null, 2));
      return res.json({ 
        encontrado: false,
        debug_api_response: searchData  // Para debug
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('📦 Stack:', error.stack);
    return res.status(500).json({ 
      error: error.message,
      encontrado: false,
      debug_error_stack: error.stack
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Proxy FatSecret funcionando!' });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Proxy FatSecret para n8n',
    endpoints: {
      search: 'POST /api/search',
      health: 'GET /api/health'
    }
  });
});

// Para desenvolvimento local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Proxy rodando na porta ${PORT}`);
});

module.exports = app;
