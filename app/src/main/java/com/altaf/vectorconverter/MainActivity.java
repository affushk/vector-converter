package com.altaf.vectorconverter;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
  private static final int FILE_CHOOSER=9811;
  private ValueCallback<Uri[]> fileCallback;
  private WebView webView;

  @Override protected void onCreate(Bundle savedInstanceState){
    super.onCreate(savedInstanceState);
    webView=new WebView(this);
    setContentView(webView);
    WebSettings s=webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowContentAccess(true);
    webView.setWebViewClient(new WebViewClient());
    webView.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){
        if(fileCallback!=null) fileCallback.onReceiveValue(null);
        fileCallback=callback;
        Intent i=new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("image/*");
        startActivityForResult(Intent.createChooser(i,"Select image"),FILE_CHOOSER);
        return true;
      }
    });
    webView.loadUrl("file:///android_asset/index.html");
  }

  @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
    super.onActivityResult(requestCode,resultCode,data);
    if(requestCode==FILE_CHOOSER && fileCallback!=null){
      Uri[] result=null;
      if(resultCode==RESULT_OK && data!=null && data.getData()!=null) result=new Uri[]{data.getData()};
      fileCallback.onReceiveValue(result);
      fileCallback=null;
    }
  }

  @Override public void onBackPressed(){
    if(webView!=null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
  }
}