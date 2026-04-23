function updfindwname(SkMp)
% updfindwname - gui-callbackfunction for finding and plotting named object
defaultanswer = {''};
name = 'Sky-search';
prompt = {'Name to find'};
answer = inputdlg(prompt,name,1,defaultanswer);

if ~isempty(answer)
  answer = answer{1};
  if ~isempty(answer)
    name2find = answer;
    skmp_plot_named(SkMp,name2find);
  end
end

