import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fallbackData from '@/lib/shopee_fallback.json';

// Simple Vietnamese stop words to filter out before searching
const STOP_WORDS = new Set([
  'tôi', 'muốn', 'mua', 'bán', 'cần', 'tìm', 'cho', 'em', 'có', 'sản', 'phẩm', 
  'cửa', 'hàng', 'shop', 'bên', 'a', 'ơi', 'dạ', 'nhé', 'với', 'cái', 'chiếc',
  'loại', 'nào', 'gì', 'ở', 'đâu', 'bao', 'nhiêu', 'giá', 'tiền'
]);

// Helper to calculate product priority score
function getPriorityScore(p) {
  const sold = parseFloat(p.monthly_sold_value) || 0;
  const liked = parseFloat(p.liked_count) || 0;
  const discount = parseFloat(p.discount_percent) || 0;
  const rating = parseFloat(p.rating) || 0;
  
  // Custom formula: sold*0.4 + likes*0.2 + discount*300 + rating*1000
  return (sold * 0.4) + (liked * 0.2) + (discount * 300) + (rating * 1000);
}

// Helper to query products either from Supabase or Local JSON
async function queryProducts(queryText) {
  const isSupabaseConfigured = 
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

  // Extract clean keywords
  const keywords = queryText
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));

  if (isSupabaseConfigured) {
    try {
      console.log('Querying Supabase database with keywords:', keywords);
      // In Supabase, we can use ilike on product_name
      // For multiple keywords, we can chain or build a query
      let query = supabase.from('products').select('*').eq('is_sold_out', false);
      
      if (keywords.length > 0) {
        // Simple search: match first 2 keywords using OR or AND
        // For simplicity, we search for products containing the first keyword
        query = query.ilike('product_name', `%${keywords[0]}%`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Calculate scores and sort
      const scored = data.map(p => ({
        ...p,
        priority_score: getPriorityScore(p)
      }));
      
      scored.sort((a, b) => b.priority_score - a.priority_score);
      return scored.slice(0, 5);
    } catch (e) {
      console.error('Supabase query error, falling back to local JSON:', e);
    }
  }

  // Fallback to local JSON
  console.log('Querying local JSON fallback with keywords:', keywords);
  if (keywords.length === 0) {
    // Return top popular items if no keywords
    const scored = fallbackData.products.map(p => ({
      ...p,
      priority_score: getPriorityScore(p)
    }));
    scored.sort((a, b) => b.priority_score - a.priority_score);
    return scored.slice(0, 5);
  }

  // Filter products that contain any of the keywords in name or brand
  const matched = fallbackData.products.filter(p => {
    const name = p.product_name.toLowerCase();
    const brand = (p.brand || '').toLowerCase();
    return keywords.some(k => name.includes(k) || brand.includes(k));
  });

  const scored = matched.map(p => ({
    ...p,
    priority_score: getPriorityScore(p)
  }));
  
  scored.sort((a, b) => b.priority_score - a.priority_score);
  return scored.slice(0, 5);
}

// Function to call Google Gemini API
async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const resJson = await response.json();
  return resJson.candidates[0].content.parts[0].text;
}

// Function to call OpenAI API (GPT-4o-mini)
async function callOpenAI(systemInstruction, history, message, apiKey) {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const messages = [
    { role: 'system', content: systemInstruction }
  ];
  
  history.slice(-6).forEach(h => {
    messages.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text
    });
  });
  
  messages.push({ role: 'user', content: message });
  
  const payload = {
    model: 'gpt-4.1-mini',
    messages,
    temperature: 0.3
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
  }

  const resJson = await response.json();
  return resJson.choices[0].message.content;
}

export async function POST(req) {
  try {
    const { message, history = [], cart = [], step = 'idle', customerInfo = {} } = await req.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openAIKey = process.env.OPENAI_API_KEY;
    
    const isGeminiAvailable = geminiKey && geminiKey !== 'your-gemini-api-key-here' && geminiKey.trim() !== '';
    const isOpenAIAvailable = openAIKey && openAIKey !== 'your-openai-api-key-here' && openAIKey.trim() !== '';
    const isLlmAvailable = isOpenAIAvailable || isGeminiAvailable;

    // 1. Search products from DB/Fallback
    const matchedProducts = await queryProducts(message);

    // 2. Dual-mode handling
    if (isLlmAvailable) {
      // LLM RAG MODE
      // Format products as context
      const productsContext = matchedProducts.map(p => {
        const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price);
        const originalPrice = p.price_original ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price_original) : '';
        const discountTag = p.discount_percent ? `(Giảm ${p.discount_percent}%)` : '';
        const brandStr = p.brand ? `[Hãng: ${p.brand}]` : '';
        
        return `- ID: ${p.item_id} | ${p.product_name} | Giá: ${formattedPrice} ${originalPrice ? `(Giá gốc: ${originalPrice})` : ''} ${discountTag} | Đánh giá: ${p.rating}/5 sao | Đã bán: ${p.monthly_sold_value} sản phẩm/tháng ${brandStr}`;
      }).join('\n');

      const systemInstruction = `Bạn là chatbot bán hàng thông minh của Shopee FMCG (chuyên các mặt hàng bánh kẹo, đồ uống, sữa của các hãng nổi tiếng như Nestlé, Orion, Mars, Kinh Đô, Bibica, Hải Hà, Richy, Perfetti Van Melle).
Nhiệm vụ của bạn là tư vấn sản phẩm thân thiện, lễ phép và chốt đơn khách hàng bằng tiếng Việt. Luôn dùng 'dạ', 'em' xưng hô với khách.

Dữ liệu sản phẩm hiện có liên quan đến câu hỏi của khách hàng:
${productsContext || 'Không tìm thấy sản phẩm nào phù hợp trong kho.'}

Giỏ hàng hiện tại của khách: ${JSON.stringify(cart)}
Thông tin giao hàng hiện tại của khách: ${JSON.stringify(customerInfo)}

HƯỚNG DẪN ĐẶC BIỆT:
1. Nếu khách hàng tỏ ý muốn đặt mua một sản phẩm cụ thể (ví dụ: "Cho anh 2 hộp Milo", "Tôi muốn mua Chocopie"), bạn hãy phản hồi lịch sự xác nhận và thêm mã lệnh \`[ADD_TO_CART: <item_id>, <quantity>]\` ở cuối câu trả lời của bạn. Thay thế <item_id> bằng mã ID thật của sản phẩm và <quantity> bằng số lượng.
2. Nếu khách hàng muốn thanh toán hoặc chốt đơn, hãy chủ động xin thông tin giao hàng (Họ tên, SĐT, Địa chỉ nhận hàng). Hỏi một cách tự nhiên.
3. Khi khách hàng đã cung cấp ĐẦY ĐỦ 3 thông tin (Họ tên, SĐT, Địa chỉ), hãy tổng kết lại đơn hàng (danh sách sản phẩm, tổng tiền) và thêm mã lệnh \`[CHECKOUT: <name>, <phone>, <address>]\` ở cuối câu trả lời để tạo đơn hàng.

Hãy hội thoại tự nhiên, không nhắc đến các mã lệnh này với khách hàng.`;

      try {
        let botResponse = '';
        if (isOpenAIAvailable) {
          console.log('Using OpenAI API Key for chatbot NLU...');
          botResponse = await callOpenAI(systemInstruction, history, message, openAIKey);
        } else {
          console.log('Using Gemini API Key for chatbot NLU...');
          const historyContext = history.slice(-6).map(h => `${h.role === 'user' ? 'Khách hàng' : 'Bot'}: ${h.text}`).join('\n');
          const fullPrompt = `${systemInstruction}\n\nLịch sử hội thoại gần đây:\n${historyContext}\n\nKhách hàng: ${message}\nBot:`;
          botResponse = await callGemini(fullPrompt, geminiKey);
        }

        // Parse special command tags in response
        let updatedCart = [...cart];
        let updatedStep = step;
        let updatedCustomerInfo = { ...customerInfo };
        let orderCreated = null;

        // Check for ADD_TO_CART
        const addToCartRegex = /\[ADD_TO_CART:\s*([a-zA-Z0-9_-]+)\s*,\s*(\d+)\s*\]/;
        const addMatch = botResponse.match(addToCartRegex);
        if (addMatch) {
          const itemId = addMatch[1];
          const qty = parseInt(addMatch[2]) || 1;
          
          const prod = matchedProducts.find(p => p.item_id === itemId) || 
                       fallbackData.products.find(p => p.item_id === itemId);
                       
          if (prod) {
            const existingIdx = updatedCart.findIndex(item => item.item_id === itemId);
            if (existingIdx !== -1) {
              updatedCart[existingIdx].quantity += qty;
            } else {
              updatedCart.push({
                item_id: prod.item_id,
                product_name: prod.product_name,
                price: parseFloat(prod.price),
                image_url: prod.image_url,
                quantity: qty
              });
            }
          }
          botResponse = botResponse.replace(addToCartRegex, '').trim();
        }

        // Check for CHECKOUT
        const checkoutRegex = /\[CHECKOUT:\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]/;
        const checkoutMatch = botResponse.match(checkoutRegex);
        if (checkoutMatch && updatedCart.length > 0) {
          const name = checkoutMatch[1].trim();
          const phone = checkoutMatch[2].trim();
          const address = checkoutMatch[3].trim();

          updatedCustomerInfo = { name, phone, address };
          
          orderCreated = await saveOrder({
            customer_name: name,
            customer_phone: phone,
            customer_address: address,
            items: updatedCart,
            total_amount: updatedCart.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0)
          });

          updatedCart = [];
          updatedStep = 'success';
          botResponse = botResponse.replace(checkoutRegex, '').trim();
        }

        return NextResponse.json({
          text: botResponse,
          cart: updatedCart,
          step: updatedStep,
          customerInfo: updatedCustomerInfo,
          order: orderCreated,
          recommendations: matchedProducts
        });

      } catch (llmError) {
        console.error('LLM API error, falling back to offline state machine:', llmError);
      }
    }

    // OFFLINE MATCHER MODE (No API Key or Gemini Failure)
    let updatedCart = [...cart];
    let updatedStep = step;
    let updatedCustomerInfo = { ...customerInfo };
    let replyText = '';
    let orderCreated = null;

    const lowerMessage = message.toLowerCase();

    // Check state machine
    if (updatedStep === 'ask_name') {
      // Parse name and phone
      // Simple heuristic: extract phone number (digits >= 9)
      const phoneRegex = /(0[3|5|7|8|9]\d{8})/g; 
      const phoneMatch = message.match(phoneRegex);
      const phone = phoneMatch ? phoneMatch[0] : '';
      
      let name = message.replace(phone, '').replace(/[-;|]/g, '').trim();
      if (name.length < 2) name = 'Khách hàng';

      updatedCustomerInfo.name = name;
      updatedCustomerInfo.phone = phone || '0900000000';
      updatedStep = 'ask_address';
      replyText = `Dạ em cảm ơn anh/chị ${name}! Cho em xin địa chỉ cụ thể để em giao hàng tận nơi nhé ạ?`;
    } 
    else if (updatedStep === 'ask_address') {
      updatedCustomerInfo.address = message;
      updatedStep = 'confirm_order';
      
      const cartDetails = updatedCart.map(item => `  - ${item.quantity}x ${item.product_name} (${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price * item.quantity)})`).join('\n');
      const total = updatedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const formattedTotal = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(total);

      replyText = `Dạ em đã ghi nhận địa chỉ giao hàng của mình.\n\nThông tin đơn hàng của mình gồm:\n${cartDetails}\n\n*Tổng tiền:* ${formattedTotal} (Miễn phí vận chuyển).\n\n*Thông tin người nhận:* \n - Tên: ${updatedCustomerInfo.name}\n - SĐT: ${updatedCustomerInfo.phone}\n - Địa chỉ: ${updatedCustomerInfo.address}\n\nAnh/chị vui lòng nhắn *'Xác nhận'* để em lên đơn giao đi nhé ạ!`;
    } 
    else if (updatedStep === 'confirm_order') {
      if (lowerMessage.includes('xác nhận') || lowerMessage.includes('ok') || lowerMessage.includes('đúng') || lowerMessage.includes('mua')) {
        // Create order
        orderCreated = await saveOrder({
          customer_name: updatedCustomerInfo.name,
          customer_phone: updatedCustomerInfo.phone,
          customer_address: updatedCustomerInfo.address,
          items: updatedCart,
          total_amount: updatedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        });
        
        replyText = `Dạ, đơn hàng của mình đã được xác nhận thành công! 🎉 \nMã đơn hàng của anh/chị là: **#ORD-${orderCreated.order_id.slice(0, 8)}**.\nNhân viên giao hàng sẽ liên hệ với mình sớm nhất ạ. Em cảm ơn anh/chị nhiều!`;
        updatedCart = [];
        updatedStep = 'success';
      } else {
        replyText = `Dạ anh/chị vui lòng kiểm tra lại thông tin đơn hàng và nhắn *'Xác nhận'* để em tiến hành gửi đi nhé ạ.`;
      }
    } 
    else {
      // Idle mode - standard product search & cart adding
      // Check if user wants to checkout
      const wantsCheckout = lowerMessage.includes('thanh toán') || lowerMessage.includes('chốt đơn') || lowerMessage.includes('đặt hàng');
      if (wantsCheckout && updatedCart.length > 0) {
        updatedStep = 'ask_name';
        replyText = `Dạ em rất sẵn lòng chốt đơn cho anh/chị. Anh/chị vui lòng cho em xin Họ Tên và Số điện thoại nhận hàng nhé ạ?`;
      } 
      // Check if user wants to buy a specific matched product (e.g. "mua milo", "lấy 2 combo milo")
      else {
        let addedSomething = false;
        
        // Simple heuristic: if matchedProducts has items and message contains buy keywords
        const buyKeywords = ['mua', 'lấy', 'chọn', 'đặt', 'thêm vào giỏ', 'hốt'];
        const isBuyIntent = buyKeywords.some(k => lowerMessage.includes(k));
        
        if (isBuyIntent && matchedProducts.length > 0) {
          const firstProd = matchedProducts[0];
          // Determine quantity
          const qtyMatch = lowerMessage.match(/(\d+)/);
          const qty = qtyMatch ? parseInt(qtyMatch[0]) : 1;
          
          const existingIdx = updatedCart.findIndex(item => item.item_id === firstProd.item_id);
          if (existingIdx !== -1) {
            updatedCart[existingIdx].quantity += qty;
          } else {
            updatedCart.push({
              item_id: firstProd.item_id,
              product_name: firstProd.product_name,
              price: parseFloat(firstProd.price),
              image_url: firstProd.image_url,
              quantity: qty
            });
          }
          
          addedSomething = true;
          const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(firstProd.price);
          replyText = `Dạ em đã thêm **${qty}x ${firstProd.product_name}** (Đơn giá: ${formattedPrice}) vào giỏ hàng của mình rồi ạ. \n\nAnh/chị có muốn tìm mua thêm bánh kẹo hay nước uống gì nữa không hay để em hướng dẫn mình *Thanh toán* luôn ạ?`;
        } 
        
        if (!addedSomething) {
          if (matchedProducts.length > 0) {
            const prodList = matchedProducts.map(p => {
              const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price);
              const originalPrice = p.price_original ? `~~${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price_original)}~~` : '';
              const discount = p.discount_percent ? ` [Giảm ${p.discount_percent}%]` : '';
              return `*   **${p.product_name}**\n    👉 Giá bán: ${formattedPrice} ${originalPrice} ${discount}\n    ⭐ Đánh giá: ${p.rating}/5 | Thương hiệu: ${p.brand || 'Khác'}`;
            }).join('\n\n');

            replyText = `Dạ, em tìm thấy một số sản phẩm đang có ưu đãi tốt và bán chạy nhất phù hợp với yêu cầu của mình đây ạ:\n\n${prodList}\n\nAnh/chị muốn chọn mua sản phẩm nào nhắn em thêm vào giỏ hàng nhé ạ!`;
          } else {
            replyText = `Dạ, hiện tại em chưa tìm thấy sản phẩm nào khớp chính xác từ khóa của mình. \n\nShop em có đầy đủ các loại bánh kẹo ChocoPie Orion, kẹo Alpenliebe, bánh gạo Richy, Milo và Nestea chiết khấu cao. Anh/chị có thể nhập tên thương hiệu để em tìm kiếm ưu đãi giúp mình nhé ạ!`;
          }
        }
      }
    }

    return NextResponse.json({
      text: replyText,
      cart: updatedCart,
      step: updatedStep,
      customerInfo: updatedCustomerInfo,
      order: orderCreated,
      recommendations: matchedProducts
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Helper to save order in database (Supabase) or local simulation
async function saveOrder(orderData) {
  const isSupabaseConfigured = 
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-supabase-project-id.supabase.co' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder-project.supabase.co';

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .insert({
          customer_name: orderData.customer_name,
          customer_phone: orderData.customer_phone,
          customer_address: orderData.customer_address,
          items: orderData.items,
          total_amount: orderData.total_amount
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Failed to save order to Supabase, falling back to simulation:', e);
    }
  }

  // Local simulation: return a mock order record with random UUID
  const mockId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return {
    order_id: mockId,
    customer_name: orderData.customer_name,
    customer_phone: orderData.customer_phone,
    customer_address: orderData.customer_address,
    items: orderData.items,
    total_amount: orderData.total_amount,
    status: 'Pending',
    created_at: new Date().toISOString()
  };
}
