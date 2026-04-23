function [status,result] = my_unix(cmd)

status = [];
try
  [status,w] = unix(cmd);
catch
  [status,w] = system(cmd);
end
i = 1;
result = [];
while (length(w)>0)
  
  [tmp,w] = strtok(w);
  
  if ( i == 1 )
    
    result = tmp;
    i = 2;
    
  else
    
    result = str2mat(result,tmp);
    
  end
  
end
result = result(1:end-1,:);