//画布环境初始化设置需要的参数
var canvas;
var gl;
var program;

//需要从界面获取的参数，初始化值
var theta = 0;
var phi = 90;
var xyzflag=0; //0-x,1-y,2-z;根据交互得到图形那个方向进行缩放
var scalefactor=1.0;//根据交互得到是放大还是缩小,设置单一次缩放的比例因子1.1或者0.9
var fov = 120; //perspective的俯仰角，越大图投影越小
var isOrth= true ;//
var texture1,cubeMap;

var radius=1.5;//眼睛绕X和Y轴转动所依球的半径.模型坐标规约到（0..1）之间


//初始化值
var  ModelMatrix = mat4();//单位阵
var  ViewMatrix=mat4();//单位阵
var  ProjectionMatrix=mat4();//单位矩阵
var texSize = 256;
var fogDist = new Float32Array([0.0,9.5]);

//对应shader里的变量
var  u_ModelMatrix,u_ViewMatrix, u_ProjectionMatrix;
var u_flag;//区分坐标轴还是图形
var u_NormalMatrix;//为了对法向量进行正确变换引入的矩阵=MV的转置后求逆
var NormalMatrix=mat4();


/*****************设置光源和材质参数*********************************/
var lightType=1.0; //w=1,(x,y,z)是光源位置,w=0,(x,y,z)是向量光源方向
var lightPosition=vec4(0.0, 0.0, 1.0, lightType ); 
var lightAmbient = vec4(0.3, 0.3, 0.3, 0.5 );
var lightDiffuse = vec4( 0.0, 1.0, 1.0, 1.0 );//红光
var lightSpecular = vec4( 0.0, 0.0, 0.0, 0.0 );

var materialAmbient = vec4( 1.0, 1.0, 1.0, 1.0 );
var materialDiffuse = vec4(  1.0, 1.0, 1.0, 1.0 );//材质漫反射系数
var materialSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );//材质镜面反射系数
var materialShininess = 20.0;//材质镜面反射抛光系数

var ambientProduct = mult(lightAmbient, materialAmbient);
var diffuseProduct = mult(lightDiffuse, materialDiffuse);
var specularProduct = mult(lightSpecular, materialSpecular);



/*设置纹理相关信息供WebGL使用，并进行绘制*/
function loadTexture(gl,texture,u_Sampler,image,texUnit) {
    //对纹理图像进行y轴反转
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);
    //开启0号纹理单元
    gl.activeTexture(gl.TEXTURE1);
    //向target绑定纹理对象
    gl.bindTexture(gl.TEXTURE_2D,texture);
    //配置纹理参数
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    //配置纹理图像
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    //将0号纹理传递给着色器
    gl.uniform1i(u_Sampler,texUnit);
    //绘制
    gl.clearColor(0.0,0.0,0.0,1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
}

function configureCubeMap() {
    cubeMap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMap);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

	var faces = [
	    ["./skybox/right.jpg", gl.TEXTURE_CUBE_MAP_POSITIVE_X],
        ["./skybox/left.jpg", gl.TEXTURE_CUBE_MAP_NEGATIVE_X],
        ["./skybox/top.jpg", gl.TEXTURE_CUBE_MAP_POSITIVE_Y],
        ["./skybox/bottom.jpg", gl.TEXTURE_CUBE_MAP_NEGATIVE_Y],
        ["./skybox/front.jpg", gl.TEXTURE_CUBE_MAP_POSITIVE_Z],
        ["./skybox/back.jpg", gl.TEXTURE_CUBE_MAP_NEGATIVE_Z]
		];

    for (var i = 0; i < 6; i++) {
        var face = faces[i][1];
        var image = new Image();
        image.src = faces[i][0];
        image.onload = function (cubeMap, face, image) {
            return function () {
				gl.texImage2D(face, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMap);
            }
        }(cubeMap, face, image);
	}

}
/*******************************************************************/


/***窗口加载时调用:程序环境初始化程序********/
window.onload = function() {
	canvas = document.getElementById( "canvas" ); //创建画布
    gl = WebGLUtils.setupWebGL( canvas );    //创建webgl画图环境
    if ( !gl ) { alert( "WebGL isn't available" ); }
	
	program = initShaders( gl, "vertex-shader", "fragment-shader" );//初始化shader
    
	gl.useProgram( program );	//启用	
	canvas.width = document.body.clientWidth;   //获取画布宽度       
    canvas.height = document.body.clientHeight; //获取画布高度  
	gl.viewport( 0, 0, canvas.width, canvas.height );//设置视口大小同画布大小	
	gl.enable(gl.DEPTH_TEST); //开启深度缓存
    gl.clearColor(0.737255, 0.745098, 0.752941, 1.0); //设置背景色 
	
	
	//---------------------------生成顶点数据并保存到顶点属性数组---------------------
	colorCube(7.5);    //生成立方体需要的顶点位置和颜色到points[],colors[]
	sphere(0.5);
	colorCube2(0.5);
	
	
    //------Associate out shader variables with our data buffer and variable-------
    var vBuffer = gl.createBuffer();//为points存储的缓存
    gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW );  //flatten：MV.js里函数，扁平化
    var vPosition = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPosition, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPosition );
	

	var cBuffer = gl.createBuffer();//为colors存储的缓存
    gl.bindBuffer( gl.ARRAY_BUFFER, cBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW ); //flatten：MV.js里函数，扁平化
    
    
    var vColor = gl.getAttribLocation( program, "vColor" );
    gl.vertexAttribPointer( vColor, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vColor );
	
    u_ModelMatrix = gl.getUniformLocation(program,"u_ModelMatrix");
	u_ViewMatrix = gl.getUniformLocation( program, "u_ViewMatrix" );
    u_ProjectionMatrix = gl.getUniformLocation( program, "u_ProjectionMatrix" );
    u_flag = gl.getUniformLocation(program, "u_flag");

	
	/******************关联并传递光源和材质的不变参数给shader*************************/
	
	u_NormalMatrix=gl.getUniformLocation( program, "u_NormalMatrix" );//变量
	
	gl.uniform4fv( gl.getUniformLocation(program,  "ambientProduct"),flatten(ambientProduct) );//常量直接传
    gl.uniform4fv( gl.getUniformLocation(program,  "diffuseProduct"),flatten(diffuseProduct) );
    gl.uniform4fv( gl.getUniformLocation(program,  "specularProduct"),flatten(specularProduct) );
    gl.uniform4fv( gl.getUniformLocation(program,  "lightPosition"),flatten(lightPosition) );
    gl.uniform1f( gl.getUniformLocation(program,  "shininess"),materialShininess );
	
    //设置顶点MC下的初始法向量数组nBuffer，并关联shader中属性变量vNormal	
	var nBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData( gl.ARRAY_BUFFER, flatten(normalsArray), gl.STATIC_DRAW );
    var vNormal = gl.getAttribLocation( program, "vNormal" );
    gl.vertexAttribPointer( vNormal, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vNormal); 

    var fogColor = new Float32Array([0.137, 0.231, 0.423]);
    u_FogColor = gl.getUniformLocation(program, 'u_FogColor');
    u_FogDist = gl.getUniformLocation(program, 'u_FogDist');
    if (!u_FogColor || !u_FogDist) {
        console.log('Failed to get the storage location');
        return;
      }
    gl.uniform3fv(u_FogColor, fogColor);    
    gl.uniform2fv(u_FogDist, fogDist);
	 
	 /***************环境纹理**********************************************/
	gl.activeTexture(gl.TEXTURE0);
    configureCubeMap();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMap);
	gl.uniform1i(gl.getUniformLocation(program, "texMap"), 0);
	
	//---------------------------------------------------------------------------------
    render();//调用绘制函数
}

function initArrayBuffer(gl, data, num, type, attribute) {

    // 创建缓冲区
    var buffer = gl.createBuffer();

    if (!buffer) {

        console.log('创建缓冲区失败!');
        return false;

    }

    // 写入数据到缓冲区
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    // 将缓冲区对象分配给属性变量
    var a_attribute = gl.getAttribLocation(gl.program, attribute);

    if (a_attribute < 0) {

        console.log('获取变量存储地址失败' + attribute);
        return false;

    }

    gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);

    // 启用缓冲区属性变量
    gl.enableVertexAttribArray(a_attribute);

    return true;

}

/******绘制函数render************/
function render(){	
    //清屏
	gl.clear( gl.COLOR_BUFFER_BIT );  //用背景色清屏
	
	//视点和投影必须一起作，并且位置放在render里恰当！
	formViewMatrix();
	formProjectMatrix();

    
    //传递变换矩阵	
	gl.uniformMatrix4fv(u_ModelMatrix, false, flatten(ModelMatrix));//传递模型变换矩阵	
	gl.uniformMatrix4fv( u_ViewMatrix, false, flatten(ViewMatrix) );//传递视点变换矩阵
    gl.uniformMatrix4fv( u_ProjectionMatrix, false, flatten(ProjectionMatrix) );//传递投影变换矩阵
	
		
	
	//传递魔术矩阵：法向量变换矩阵（本例未用之）
	var MV=mat4();
	MV=mult(ViewMatrix,ModelMatrix);
	NormalMatrix=normalMatrix(MV, false);//图形进行的模视变换,调用MV.js中函数normalMatrix(m, flag) 
	gl.uniformMatrix4fv(u_NormalMatrix, false, flatten(NormalMatrix));//传递法向量变换矩阵	


	//标志位为0，绘制天空盒
	gl.uniform1i(u_flag, 0); 
	gl.drawArrays( gl.TRIANGLES,0, 36);//绘制立方体,球体等三角形封闭网格

	//标志位为1，绘制中间图形-本例是球体，
	gl.uniform1i(u_flag, 1); 
	gl.drawArrays( gl.TRIANGLES,36, points.length-36);//绘制立方体,球体等三角形封闭网格
	
}

/*********绘图界面随窗口交互缩放而相应变化**************/
window.onresize = function(){
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    gl.viewport( 0, 0, canvas.width, canvas.height );		
	render();
}

/*********注册键盘按键事件**********************/
window.onkeydown = function(e){
    let code = e.keyCode;
    switch (code) {
        case 32:    // 空格-重置
                initViewingParameters();//恢复相机初始位置，MVP矩阵单位化，投影方式为正投影
                break;	
		case 67://C键：光源类型切换
                if(lightType==1.0) lightType=0.0; else lightType=1.0;
                lightPosition[3]=lightType; 
                gl.uniform4fv( gl.getUniformLocation(program,  "lightPosition"),flatten(lightPosition) );////传递光源，有交互变化时
                break;
			
        //WS/AD-相机绕X/Y轴旋转,重新计算EYE和UP			
        case 87:   
                phi -=5; // W-视点绕X轴顺时针旋转5度				
                break;
		case 83:    
                phi +=5;  // S-视点绕X轴逆时针旋转5度
                break;
		case 65:    // A-视点绕Y轴顺时针旋转5度
                theta -=5;
                break;
        case 68:    // D-视点绕Y轴逆时针旋转5度
                theta += 5;
				break;
		case 90:	//Z-视点距离中心距离缩短
				radius-=0.1;
				if(radius<0) radius=0.001;
				break;
		case 88:
                radius+=0.1;//X-视点距离中心距离加大
                if(radius>7) radius=7;
				break;

        case 38: // Up arrow key -> Increase the maximum distance of fog
                fogDist[1]  += 0.2;
                gl.uniform2fv(u_FogDist, fogDist);
                break;
        case 40: // Down arrow key -> Decrease the maximum distance of fog
                if (fogDist[1] > fogDist[0]+1.0) {
                    fogDist[1] -= 0.2;
                    gl.uniform2fv(u_FogDist, fogDist);
                }                
                break;        
				
	    //P-切换投影方式
		case 80:     //P-切换投影方式
		    isOrth=!isOrth;
		    break;
			
		case 77://M   //放大俯仰角
			fov+=5;
            break;
				
		case 78://N  //较小俯仰角
		    fov-=5;
            break; 

		//JL/IK/UO-物体缩放X/Y/Z
        case 74:       // J-缩放X-放大
            xyzflag=0;
			scalefactor=1.1;
			formModelMatrix();
			break;
		case 76:       // L-缩放X-缩小
			xyzflag=0;
			scalefactor=0.9;
			formModelMatrix();
            break;
		case 73:       // I-缩放Y-放大
            xyzflag=1;
			scalefactor=1.1;
			formModelMatrix();
			break;
		case 75:       // K-缩放Y-缩小
			xyzflag=1;
			scalefactor=0.9;
			formModelMatrix();
            break;	
		case 85:       // U-缩放Z-放大
			xyzflag=2;
			scalefactor=1.1;
			formModelMatrix();
            break;
		case 79:       // O-缩放Z-缩小
			xyzflag=2;
			scalefactor=0.9;
            formModelMatrix();			
            break;
       
    }	
	render();//交互后需要调用render重新绘制
}



//////////////////////////////////////////////////////////////////////////////////////////////////////
/*复位：需要恢复变量的初值：模型变换矩阵参数复原，恢复相机初始位置，投影方式为正投影*/
function initViewingParameters(){
	//需要从界面获取的参数，初始化值
	//需要从界面获取的参数，初始化值
	theta = 0;
	phi = 90;
	xyzflag=0; //0-x,1-y,2-z;根据交互得到图形那个方向进行缩放
	scalefactor=1.0;//根据交互得到是放大还是缩小,设置单一次缩放的比例因子1.1或者0.9

	isOrth= true ;//默认是正投影
	fov = 120; //perspective的俯仰角，越大图投影越小
	//初始化值
	ModelMatrix = mat4();//单位阵
	ViewMatrix=mat4();//单位阵
	ProjectionMatrix=mat4();//单位矩阵
	
	radius=1.5;	
};


/*生成模型变换矩阵*/
function formModelMatrix(){
	//根据xyzflag，构造当前这一次操作的缩放矩阵
	//再和之前的模型矩阵左乘，得到累乘的模型变换矩阵ModelMatrix
    switch (xyzflag) {
        case 0: // X方向
            ModelMatrix = mult(scalem(scalefactor,1.0,1.0),ModelMatrix); //scalem是MV.js里函数
			break;
		case 1: //Y方向
			ModelMatrix = mult(scalem(1.0,scalefactor,1.0),ModelMatrix); 			
			break;
		case 2:
		    ModelMatrix = mult(scalem(1.0,1.0,scalefactor),ModelMatrix); 
			break;
	}
}

/*将角度转换为弧度表示*/
function toRad(deg){
    return deg * Math.PI / 180;//JS三角函数需要输入的参数是弧度，将角度转换为弧度
};


/*生成观察变换矩阵/相机变换矩阵/视点变换矩阵*/
function formViewMatrix(){
var eye=vec3(0.0,0.0,radius);//初始值
var up=vec3(0.0,1.0,0.0);
const at = vec3(0.0, 0.0, 0.0); //本例中没有交互修改的参数
	//=vertexMC+0.2=0.4;	
	//计算出眼睛EYE的位置:绕X和Y轴旋转运动后的位置(phi绕X轴转动后累积角度，theta是绕Y轴后转动累积角度)	
	eye = vec3( radius * Math.sin(toRad(phi)) * Math.sin(toRad(theta)), 
                radius * Math.cos(toRad(phi)), 
              radius * Math.sin(toRad(phi)) * Math.cos(toRad(theta)));
	//计算出眼睛所在位置的向上的向量UP
    up = vec3(  2 * radius * Math.sin(toRad(phi-60)) * Math.sin(toRad(theta)), 
              2 * radius * Math.cos(toRad(phi-60)), 
              2 * radius * Math.sin(toRad(phi-60)) * Math.cos(toRad(theta)));
              
    var u_radius = gl.getUniformLocation(gl.program, 'u_radius');
    gl.uniform1f(u_radius,radius);
	//用LOOKAT函数生成观察变换矩阵
	ViewMatrix=lookAt(eye, at, up); //MV.js里的函数
};



/* 生成规范化投影变换矩阵 	*/
function formProjectMatrix(){
const left = -1.0; 
const right = 1.0;
const bottom = -1.0;
const ytop = 1.0;
const near = 0.1;//这个值要小比较好
const far = 30.0;
var aspect;
    //设置aspect=canvas的纵横比
    aspect=canvas.height/canvas.width; //和显示画布w/h保持一致
	//判定isOrth，true-正投影,false-透视投影
	if(isOrth){	
		ProjectionMatrix = ortho(left, right, bottom, ytop, near, far);//MV.js里的函数
	}
	else
	{		
		ProjectionMatrix = perspective(fov, aspect, near, far); //MV.js里的函数
	}
}



////////////////////////////////////////////////////////////////////////////////////////////////////////








