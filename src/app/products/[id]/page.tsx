'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { products } from '@/data/products';
import { getStripe, checkStripeConfig } from '@/lib/stripe';
import { useAuthContext } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';

export default function ProductDetail() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user } = useAuthContext();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [purchaseType, setPurchaseType] = useState<'one-time' | 'subscription'>('one-time');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [stripeAvailable, setStripeAvailable] = useState(false);
  
  // 環境変数チェックをクライアントサイドで行う
  useEffect(() => {
    // Stripe設定が利用可能かチェック
    const checkStripe = () => {
      try {
        const isAvailable = checkStripeConfig();
        if (isAvailable) {
          console.log('Stripe設定を検出しました');
          setStripeAvailable(true);
        } else {
          console.warn('Stripe公開鍵が設定されていません');
          setStripeAvailable(false);
        }
      } catch (err) {
        console.error('環境変数チェックエラー:', err);
        setStripeAvailable(false);
      }
    };
    
    checkStripe();
  }, []);
  
  // 商品情報を取得
  const product = products.find(p => p.id === id);
  
  if (!product) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">商品が見つかりませんでした</h1>
          <button 
            onClick={() => router.back()}
            className="bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90 transition"
          >
            前のページに戻る
          </button>
        </div>
      </div>
    );
  }
  
  // 価格をフォーマットする関数
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY'
    }).format(price);
  };
  
  // Stripeチェックアウト処理
  const handleCheckout = async () => {
    if (!user) {
      router.push('/login?redirect=' + encodeURIComponent(`/products/${id}`));
      return;
    }
    
    // Stripe設定がない場合はエラーメッセージを表示して処理を中断
    if (!stripeAvailable) {
      setError('決済システムの設定が完了していません。管理者にお問い合わせください。');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // 商品画像のパスを絶対URLに変換
      const productImages = product.images.map(img => {
        if (img.startsWith('/')) {
          // 環境変数からサイトURLを取得、なければwindow.locationを使用
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                        (typeof window !== 'undefined' ? window.location.origin : '');
          return `${baseUrl}${img}`;
        }
        return img;
      });
      
      console.log('決済処理を開始します...');
      
      // Stripeのチェックアウトセッションを作成するAPIを呼び出す
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              name: product.name,
              description: product.description || '',
              images: productImages && productImages.length > 0 ? productImages : [],
              price: purchaseType === 'subscription' && product.subscriptionPrice 
                ? product.subscriptionPrice 
                : product.price,
              quantity: 1
            }
          ],
          purchaseType,
        }),
      });

      if (!response.ok) {
        let errorMessage = '決済セッションの作成に失敗しました';
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (err) {
          // JSONのパースに失敗した場合はデフォルトのエラーメッセージを使用
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (!data || !data.sessionId) {
        throw new Error('セッションIDが取得できませんでした');
      }
      
      console.log('セッションID取得完了:', data.sessionId);
      console.log('Stripe初期化を開始します...');
      
      // Stripeのチェックアウトページに遷移
      const stripe = await getStripe();
      if (!stripe) {
        throw new Error('Stripeの初期化に失敗しました。ブラウザの設定を確認してください。');
      }
      
      console.log('Stripe初期化完了、チェックアウトページへリダイレクトします...');
      
      const result = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });
      
      if (result.error) {
        console.error('リダイレクトエラー:', result.error);
        throw new Error(result.error.message || 'チェックアウトページへのリダイレクトに失敗しました');
      }
    } catch (error: any) {
      console.error('決済エラー:', error);
      setError(`決済処理中にエラーが発生しました: ${error.message || ''}`);
      setIsLoading(false);
    }
  };
  
  return (
    <div className="bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* 画像ギャラリー */}
            <div className="md:w-1/2 p-6">
              <div className="relative h-96 w-full mb-4">
                <Image
                  src={product.images[activeImageIndex]}
                  alt={product.name}
                  fill
                  style={{ objectFit: 'cover' }}
                  className="rounded-lg"
                />
              </div>
              
              {product.images.length > 1 && (
                <div className="flex space-x-2">
                  {product.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveImageIndex(index)}
                      className={`relative h-20 w-20 rounded-md overflow-hidden border-2 ${
                        activeImageIndex === index ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <Image
                        src={image}
                        alt={`${product.name} - イメージ ${index + 1}`}
                        fill
                        style={{ objectFit: 'cover' }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* 商品情報 */}
            <div className="md:w-1/2 p-6">
              <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
              
              <div className="mb-6">
                <span className="text-2xl font-bold text-primary">{formatPrice(product.price)}</span>
                {product.isSubscription && purchaseType === 'subscription' && (
                  <span className="text-lg ml-2 text-gray-600">
                    {formatPrice(product.subscriptionPrice || 0)}/月
                  </span>
                )}
              </div>
              
              <p className="text-gray-600 mb-6">{product.description}</p>
              
              {product.features && product.features.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-2">特徴</h2>
                  <ul className="list-disc list-inside space-y-1">
                    {product.features.map((feature, index) => (
                      <li key={index} className="text-gray-600">{feature}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-2">カテゴリー</h2>
                <p className="text-gray-600">{product.category}</p>
              </div>
              
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-2">在庫状況</h2>
                <p className={`${product.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {product.stock > 0 ? `在庫あり（残り${product.stock}個）` : '在庫切れ'}
                </p>
              </div>
              
              {product.isSubscription && (
                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-2">購入タイプ</h2>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setPurchaseType('one-time')}
                      className={`px-4 py-2 border rounded-md ${
                        purchaseType === 'one-time'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-primary'
                      }`}
                    >
                      単品購入
                    </button>
                    <button
                      onClick={() => setPurchaseType('subscription')}
                      className={`px-4 py-2 border rounded-md ${
                        purchaseType === 'subscription'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-primary'
                      }`}
                    >
                      定期購入
                    </button>
                  </div>
                </div>
              )}
              
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <button
                onClick={handleCheckout}
                disabled={isLoading || product.stock <= 0}
                className={`w-full bg-primary text-white py-3 px-6 rounded-md shadow hover:bg-opacity-90 transition ${
                  isLoading ? 'opacity-70 cursor-not-allowed' : ''
                } ${product.stock <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading ? '処理中...' : product.stock <= 0 ? '在庫切れ' : '購入する'}
              </button>
              
              {!user && (
                <p className="text-sm text-gray-600 mt-2 text-center">
                  購入するには、まずログインしてください。
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 