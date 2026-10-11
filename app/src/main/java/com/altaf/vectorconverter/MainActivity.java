package com.altaf.vectorconverter;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
  private static final int FILE_CHOOSER=9811;
  private static final int STORAGE_PERMISSION=9812;
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
    webView.addJavascriptInterface(new DownloadBridge(),"Android");
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

    if(Build.VERSION.SDK_INT<29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED){
      requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},STORAGE_PERMISSION);
    }

    webView.loadUrl("file:///android_asset/index.html");
  }

  public class DownloadBridge {
    @JavascriptInterface
    public void saveBase64(String base64, String fileName, String mimeType, String target){
      try{
        byte[] data=Base64.decode(base64,Base64.DEFAULT);
        Uri uri;

        if(Build.VERSION.SDK_INT>=29){
          ContentValues v=new ContentValues();
          v.put(MediaStore.MediaColumns.DISPLAY_NAME,fileName);
          v.put(MediaStore.MediaColumns.MIME_TYPE,mimeType);

          if("gallery".equals(target)){
            v.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/VectorConverterPro");
            uri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,v);
          }else{
            v.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/VectorConverterPro");
            uri=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);
          }

          if(uri==null) throw new Exception("Could not create file");
          try(OutputStream os=getContentResolver().openOutputStream(uri)){
            if(os==null) throw new Exception("Could not open file");
            os.write(data);
            os.flush();
          }
        }else{
          File parent;
          if("gallery".equals(target)){
            parent=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),"VectorConverterPro");
          }else{
            parent=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),"VectorConverterPro");
          }
          if(!parent.exists()) parent.mkdirs();
          File file=new File(parent,fileName);
          try(FileOutputStream fos=new FileOutputStream(file)){
            fos.write(data);
            fos.flush();
          }
          MediaScannerConnection.scanFile(MainActivity.this,new String[]{file.getAbsolutePath()},new String[]{mimeType},null);
        }

        runOnUiThread(()->Toast.makeText(MainActivity.this,
          "gallery".equals(target) ? "PNG saved to Gallery / Pictures" : "SVG saved to Downloads",
          Toast.LENGTH_LONG).show());
      }catch(Exception e){
        runOnUiThread(()->Toast.makeText(MainActivity.this,"Save failed: "+e.getMessage(),Toast.LENGTH_LONG).show());
      }
    }
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